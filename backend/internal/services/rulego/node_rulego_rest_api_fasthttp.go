/*
 * Copyright 2025 The RuleGo Authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// 自 rulego-components external/fasthttp/rest_api_call_node.go 迁入：用 FastHTTP 实现替换标准 restApiCall。
package rulego

import (
	"bytes"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/components/external"
	"github.com/rulego/rulego/utils/maps"
	"github.com/rulego/rulego/utils/str"
	"github.com/valyala/fasthttp"
)

func init() {
	const t = "restApiCall"
	if err := rulego.Registry.Unregister(t); err != nil {
		log.Printf("[rulego] 注销标准 restApiCall 失败（可忽略）: %v", err)
	}
	if err := rulego.Registry.Register(&RestApiCallNode{}); err != nil {
		log.Printf("[rulego] FastHTTP restApiCall 注册失败: %v", err)
	} else {
		log.Printf("[rulego] 已用 FastHTTP 替换节点: type=%s", t)
	}
}

// RestApiCallNode 通过 FastHTTP 调用外部 REST 服务；成功走 Success，失败走 Failure。
type RestApiCallNode struct {
	Config   external.RestApiCallNodeConfiguration
	client   *fasthttp.Client
	template *external.HTTPRequestTemplate
}

func (x *RestApiCallNode) Type() string {
	return "restApiCall"
}

func (x *RestApiCallNode) New() types.Node {
	headers := map[string]string{"Content-Type": "application/json"}
	config := external.RestApiCallNodeConfiguration{
		RequestMethod:            "POST",
		MaxParallelRequestsCount: 200,
		ReadTimeoutMs:            2000,
		Headers:                  headers,
	}
	return &RestApiCallNode{Config: config}
}

func (x *RestApiCallNode) Init(ruleConfig types.Config, configuration types.Configuration) error {
	err := maps.Map2Struct(configuration, &x.Config)
	if err == nil {
		x.Config.RequestMethod = strings.ToUpper(x.Config.RequestMethod)
		x.client = newFastHTTPClient(x.Config)
		tmp, terr := external.HttpUtils.BuildRequestTemplate(&x.Config)
		if terr != nil {
			return terr
		}
		x.template = tmp
	}
	return err
}

func (x *RestApiCallNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	var evn map[string]interface{}
	if x.template.HasVar {
		evn = base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	}
	var endpointURL string
	if v, err := x.template.UrlTemplate.Execute(evn); err != nil {
		ctx.TellFailure(msg, err)
		return
	} else {
		endpointURL = str.ToString(v)
	}

	req := fasthttp.AcquireRequest()
	resp := fasthttp.AcquireResponse()
	defer func() {
		fasthttp.ReleaseRequest(req)
		fasthttp.ReleaseResponse(resp)
	}()

	req.SetRequestURI(endpointURL)
	req.Header.SetMethod(x.Config.RequestMethod)

	if !x.Config.WithoutRequestBody {
		var body []byte
		if x.template.BodyTemplate != nil {
			if v, err := x.template.BodyTemplate.Execute(evn); err != nil {
				ctx.TellFailure(msg, err)
				return
			} else {
				body = []byte(str.ToString(v))
			}
		} else {
			body = []byte(msg.GetData())
		}
		req.SetBody(body)
	}

	for key, value := range x.template.HeadersTemplate {
		req.Header.Set(key.ExecuteAsString(evn), value.ExecuteAsString(evn))
	}

	// 未配置 Content-Type 时，FastHTTP 可能对带 body 的请求使用 application/octet-stream，
	// 部分服务端（如仅注册 JSON codec 的 Kratos HTTP）会拒绝并返回 CODEC 错误。
	if !x.Config.WithoutRequestBody {
		if b := req.Body(); len(b) > 0 {
			ct := strings.TrimSpace(string(req.Header.Peek("Content-Type")))
			if ct == "" || strings.EqualFold(ct, "application/octet-stream") {
				req.Header.Set("Content-Type", "application/json")
			}
		}
	}

	err := x.client.Do(req, resp)
	if err != nil {
		msg.Metadata.PutValue(external.ErrorBodyMetadataKey, err.Error())
		ctx.TellFailure(msg, err)
		return
	}

	statusCode := resp.StatusCode()
	msg.Metadata.PutValue(external.StatusMetadataKey, fmt.Sprintf("%d %s", statusCode, fasthttp.StatusMessage(statusCode)))
	msg.Metadata.PutValue(external.StatusCodeMetadataKey, strconv.Itoa(statusCode))

	if x.template.IsStream {
		if statusCode == 200 {
			readFromFastHTTPStream(ctx, msg, resp)
		} else {
			body := resp.Body()
			msg.Metadata.PutValue(external.ErrorBodyMetadataKey, string(body))
			ctx.TellNext(msg, types.Failure)
		}
	} else {
		body := resp.Body()
		if statusCode == 200 {
			msg.SetData(string(body))
			ctx.TellSuccess(msg)
		} else {
			strB := string(body)
			msg.Metadata.PutValue(external.ErrorBodyMetadataKey, strB)
			ctx.TellFailure(msg, errors.New(strB))
		}
	}
}

func (x *RestApiCallNode) Destroy() {
	if x.client != nil {
		x.client.CloseIdleConnections()
		time.Sleep(1 * time.Millisecond)
		x.client = nil
	}
}

func newFastHTTPClient(config external.RestApiCallNodeConfiguration) *fasthttp.Client {
	client := &fasthttp.Client{
		ReadTimeout:                   time.Duration(config.ReadTimeoutMs) * time.Millisecond,
		MaxConnsPerHost:               config.MaxParallelRequestsCount,
		DisableHeaderNamesNormalizing: true,
		DisablePathNormalizing:        true,
	}

	if config.InsecureSkipVerify {
		client.TLSConfig = &tls.Config{InsecureSkipVerify: true}
	}

	if config.EnableProxy {
		if config.UseSystemProxyProperties {
			client.Dial = createSystemProxyDialer()
		} else {
			if proxyURL := external.HttpUtils.BuildProxyURL(config.ProxyScheme, config.ProxyHost, config.ProxyPort, config.ProxyUser, config.ProxyPassword); proxyURL != nil {
				client.Dial = createProxyDialer(proxyURL)
			}
		}
	}

	return client
}

func createProxyDialer(proxyURL *url.URL) func(addr string) (net.Conn, error) {
	return func(addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}

		proxyConn, err := net.DialTimeout("tcp", proxyURL.Host, time.Second*30)
		if err != nil {
			return nil, err
		}

		switch proxyURL.Scheme {
		case "http", "https":
			return setupHTTPProxy(proxyConn, proxyURL, host, port)
		case "socks5":
			return setupSOCKS5Proxy(proxyConn, proxyURL, host, port)
		default:
			proxyConn.Close()
			return nil, fmt.Errorf("unsupported proxy scheme: %s", proxyURL.Scheme)
		}
	}
}

func createSystemProxyDialer() func(addr string) (net.Conn, error) {
	return func(addr string) (net.Conn, error) {
		proxyURL := external.HttpUtils.GetSystemProxy()
		if proxyURL == nil {
			return fasthttp.DialDualStackTimeout(addr, time.Second*30)
		}
		return createProxyDialer(proxyURL)(addr)
	}
}

func setupHTTPProxy(conn net.Conn, proxyURL *url.URL, targetHost, targetPort string) (net.Conn, error) {
	conn.SetDeadline(time.Now().Add(time.Second * 30))
	defer conn.SetDeadline(time.Time{})

	connectReq := fmt.Sprintf("CONNECT %s:%s HTTP/1.1\r\nHost: %s:%s\r\n", targetHost, targetPort, targetHost, targetPort)

	if proxyURL.User != nil {
		if password, ok := proxyURL.User.Password(); ok {
			auth := proxyURL.User.Username() + ":" + password
			encoded := "Basic " + external.HttpUtils.Base64Encode(auth)
			connectReq += "Proxy-Authorization: " + encoded + "\r\n"
		}
	}

	connectReq += "\r\n"

	if _, err := conn.Write([]byte(connectReq)); err != nil {
		conn.Close()
		return nil, err
	}

	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil {
		conn.Close()
		return nil, err
	}

	response := string(buf[:n])
	if !strings.Contains(response, "200 Connection established") {
		conn.Close()
		return nil, fmt.Errorf("proxy connection failed: %s", response)
	}

	return conn, nil
}

func setupSOCKS5Proxy(conn net.Conn, proxyURL *url.URL, targetHost, targetPort string) (net.Conn, error) {
	dialer := external.HttpUtils.CreateSOCKS5Dialer(proxyURL)
	conn.Close()
	return dialer("tcp", targetHost+":"+targetPort)
}

func readFromFastHTTPStream(ctx types.RuleContext, msg types.RuleMsg, resp *fasthttp.Response) {
	body := resp.Body()
	bodyReader := bytes.NewReader(body)
	adaptedResp := &http.Response{
		Body: io.NopCloser(bodyReader),
	}
	external.HttpUtils.ReadFromStream(ctx, msg, adaptedResp)
}
