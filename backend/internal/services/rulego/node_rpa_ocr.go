// RPA：调用本机 Tesseract 可执行文件做 OCR（需已安装 tesseract 及对应语言包）。
package rulego

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/rulego/rulego"
	"github.com/rulego/rulego/api/types"
	"github.com/rulego/rulego/components/base"
	"github.com/rulego/rulego/utils/el"
	"github.com/rulego/rulego/utils/maps"
)

func init() {
	n := &RpaOcrNode{}
	if err := rulego.Registry.Register(n); err != nil {
		log.Printf("[rulego] RPA OCR 节点注册失败: %v", err)
	} else {
		log.Printf("[rulego] 自定义节点已注册: type=%s", n.Type())
	}
}

type RpaOcrConfiguration struct {
	ImagePath     string `json:"imagePath"`
	Lang          string `json:"lang"`
	TesseractPath string `json:"tesseractPath"`
}

type RpaOcrNode struct {
	Config     RpaOcrConfiguration
	pathTmpl   el.Template
}

func (n *RpaOcrNode) Type() string { return "x/rpaOcr" }

func (n *RpaOcrNode) New() types.Node {
	return &RpaOcrNode{Config: RpaOcrConfiguration{
		ImagePath:     "",
		Lang:          "eng",
		TesseractPath: "tesseract",
	}}
}

func (n *RpaOcrNode) Init(_ types.Config, configuration types.Configuration) error {
	if err := maps.Map2Struct(configuration, &n.Config); err != nil {
		return err
	}
	var err error
	n.pathTmpl, err = el.NewTemplate(n.Config.ImagePath)
	return err
}

func (n *RpaOcrNode) OnMsg(ctx types.RuleContext, msg types.RuleMsg) {
	env := base.NodeUtils.GetEvnAndMetadata(ctx, msg)
	path := strings.TrimSpace(n.pathTmpl.ExecuteAsString(env))
	tess := strings.TrimSpace(n.Config.TesseractPath)
	if tess == "" {
		tess = "tesseract"
	}
	lang := strings.TrimSpace(n.Config.Lang)
	if lang == "" {
		lang = "eng"
	}

	var imgPath string
	var cleanup func()
	cleanup = func() {}
	defer cleanup()

	if path != "" {
		abs := getAbsPath(ctx, path)
		abs, err := filepath.Abs(abs)
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		if err := checkPath(ctx, abs); err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		imgPath = abs
	} else {
		raw := strings.TrimSpace(msg.GetData())
		if raw == "" {
			ctx.TellFailure(msg, errors.New("imagePath 为空且消息 data 无图像 Base64"))
			return
		}
		// 允许整条 data 为纯 base64，或 JSON {"image_base64":"..."}
		b64 := raw
		if strings.HasPrefix(strings.TrimSpace(raw), "{") {
			var wrap struct {
				ImageBase64 string `json:"image_base64"`
			}
			if json.Unmarshal([]byte(raw), &wrap) == nil && wrap.ImageBase64 != "" {
				b64 = wrap.ImageBase64
			}
		}
		dec, err := base64.StdEncoding.DecodeString(b64)
		if err != nil {
			ctx.TellFailure(msg, errors.New("解析图像 Base64 失败: "+err.Error()))
			return
		}
		f, err := os.CreateTemp("", "rpa-ocr-*.png")
		if err != nil {
			ctx.TellFailure(msg, err)
			return
		}
		imgPath = f.Name()
		_ = f.Close()
		cleanup = func() { _ = os.Remove(imgPath) }
		if werr := os.WriteFile(imgPath, dec, 0600); werr != nil {
			_ = os.Remove(imgPath)
			ctx.TellFailure(msg, werr)
			return
		}
	}

	cmd := exec.Command(tess, imgPath, "stdout", "-l", lang)
	out, err := cmd.Output()
	if err != nil {
		var ee *exec.ExitError
		if errors.As(err, &ee) {
			ctx.TellFailure(msg, errors.New(string(ee.Stderr)))
			return
		}
		ctx.TellFailure(msg, err)
		return
	}
	text := strings.TrimSpace(string(out))
	resp, _ := json.Marshal(map[string]any{"ok": true, "text": text})
	msg.SetData(string(resp))
	ctx.TellSuccess(msg)
}

func (n *RpaOcrNode) Destroy() {}
