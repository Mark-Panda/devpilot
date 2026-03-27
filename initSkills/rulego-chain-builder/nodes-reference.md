# RuleGo 节点类型速查表

## 触发器类

### `startTrigger` — 开始节点
```json
{ "id": "start1", "type": "startTrigger", "name": "开始", "configuration": {} }
```
- 连接：`Success`
- 说明：规则链必须有且仅有一个，作为入口节点

---

## 动作类

### `ai/llm` — 大模型节点
```json
{
  "type": "ai/llm",
  "configuration": {
    "url": "https://ai.gitee.com/v1",
    "key": "",
    "model": "Qwen2.5-72B-Instruct",
    "systemPrompt": "你是一个助手",
    "messages": [],
    "params": {
      "temperature": 0.6,
      "topP": 0.75,
      "presencePenalty": 0,
      "frequencyPenalty": 0,
      "maxTokens": 0,
      "stop": [],
      "responseFormat": "text"
    },
    "enabled_skill_names": [],
    "mcp": {
      "server_command": [],
      "server_url": "",
      "env": {},
      "tool_names": []
    }
  }
}
```
- `key`：API Key，执行时系统自动注入，可留空
- `messages`：额外的消息历史（通常留空，输入消息体作为 user 消息）
- `enabled_skill_names`：启用的技能名称列表（对应 `~/.devpilot/skills/` 目录）
- `responseFormat`：`"text"` 或 `"json_object"`
- 连接：`Success` / `Failure`

### `restApiCall` — HTTP 客户端
```json
{
  "type": "restApiCall",
  "configuration": {
    "restEndpointUrlPattern": "https://example.com/api",
    "requestMethod": "POST",
    "headers": { "Content-Type": "application/json" },
    "query": {},
    "body": "",
    "timeout": 30000,
    "maxParallelRequestsCount": 200
  }
}
```
- `restEndpointUrlPattern`：支持 `${msg.field}` 和 `${metadata.field}` 模板变量
- `requestMethod`：GET / POST / PUT / DELETE / PATCH
- `body`：请求体模板，支持变量插值，空字符串时自动使用消息体
- 连接：`Success` / `Failure`

### `volcTls/searchLogs` — 火山引擎 TLS 日志检索
```json
{
  "type": "volcTls/searchLogs",
  "configuration": {
    "endpoint": "",
    "region": "cn-beijing",
    "accessKeyId": "",
    "secretAccessKey": "",
    "sessionToken": "",
    "topicId": "",
    "defaultQuery": "*",
    "limit": 100,
    "useApiV3": false,
    "timeoutSec": 60,
    "timeRangePreset": "last_15m",
    "defaultStartTimeMs": 0,
    "defaultEndTimeMs": 0,
    "defaultSort": "desc",
    "highLight": false
  }
}
```
- `endpoint`：留空时使用 `https://tls.{region}.volces.com`
- `sessionToken`：STS 临时凭证时填写，否则留空
- `useApiV3`：`true` 时使用 SearchLogsV2（API 0.3.0），与控制台检索行为更接近
- `timeRangePreset`：无消息内 `startTime`/`endTime` 时的默认时间窗（结束为当前请求时刻）。可选 `last_15m`、`last_30m`、`last_1h`、`last_6h`、`last_24h`、`last_7d`、`today_local`（本机时区当天 0 点至今）、`custom`
- `defaultStartTimeMs` / `defaultEndTimeMs`：仅 `timeRangePreset` 为 `custom` 时生效（Unix 毫秒，且结束须大于开始）
- `defaultSort`：`desc` 或 `asc`；消息 JSON 里 `sort` 可覆盖
- `highLight`：默认是否高亮；消息 JSON 里 `highLight` 可覆盖
- 入站消息 `data`：可为检索语句字符串，或 JSON `{"query","startTime","endTime","topicId","context","sort","highLight"}`（时间单位为毫秒）
- 成功时 `data` 为 TLS 返回的 JSON（含 `Logs`、`HitCount` 等）；`metadata` 含 `volc_tls_topic_id`、`volc_tls_query`、`volc_tls_hit_count`
- 连接：`Success` / `Failure`

### `opensearch/search` — OpenSearch / Elasticsearch 日志检索
```json
{
  "type": "opensearch/search",
  "configuration": {
    "endpoint": "https://localhost:9200",
    "index": "logs-*",
    "username": "",
    "password": "",
    "insecureSkipVerify": false,
    "timeoutSec": 60,
    "defaultSearchBody": "{\"size\":100,\"sort\":[{\"@timestamp\":{\"order\":\"desc\"}}],\"query\":{\"match_all\":{}}}"
  }
}
```
- 请求：`POST {endpoint}/{index}/_search`，`index` 支持逗号分隔多索引或通配（如 `logs-*,metrics-*`）
- `defaultSearchBody`：合法 JSON 对象；鉴权为可选 Basic Auth
- 入站消息 `data`：空则使用 `defaultSearchBody`；为 JSON **对象**则作为完整 `_search` 请求体；为纯文本则包装为 `query_string.query`（`size` / `sort` 尽量从默认体继承）
- 成功时 `data` 为集群返回的 JSON；`metadata` 含 `opensearch_index`、`opensearch_http_status`、`opensearch_took_ms`、`opensearch_hits_total`（若能解析）
- 连接：`Success` / `Failure`

### `jsTransform` — JS 转换器
```json
{
  "type": "jsTransform",
  "configuration": {
    "jsScript": "metadata['processed'] = 'true';\nreturn {'msg': msg, 'metadata': metadata, 'msgType': msgType};"
  }
}
```
- `jsScript`：必须 `return {msg, metadata, msgType}`
- 可访问变量：`msg`（消息体对象）、`metadata`（键值表）、`msgType`（消息类型字符串）
- 连接：`Success` / `Failure`

### `jsFilter` — JS 过滤器
```json
{
  "type": "jsFilter",
  "configuration": {
    "jsScript": "return msg.temperature > 50;"
  }
}
```
- `jsScript`：返回 `true`/`false`
- 连接：`True` / `False` / `Failure`

### `delay` — 延迟
```json
{
  "type": "delay",
  "configuration": {
    "delayMs": "5000",
    "overwrite": false
  }
}
```
- `delayMs`：毫秒数（字符串格式），支持 `${metadata.delay}` 模板
- `overwrite`：是否覆盖等待中消息
- 连接：`Success` / `Failure`

### `log` — 日志
```json
{
  "type": "log",
  "configuration": {
    "jsScript": "return 'msg: ' + JSON.stringify(msg);"
  }
}
```
- 连接：`Success` / `Failure`

### `dbClient` — 数据库客户端
```json
{
  "type": "dbClient",
  "configuration": {
    "driverName": "mysql",
    "dsn": "root:password@tcp(127.0.0.1:3306)/dbname",
    "poolSize": 5,
    "sql": "SELECT * FROM users WHERE id = ?",
    "params": ["${msg.userId}"],
    "getOne": false,
    "opType": ""
  }
}
```
- `driverName`：`mysql` / `postgres` / `sqlite3`
- `getOne`：`true` 返回单条记录，`false` 返回数组
- `opType`：`"INSERT"`/`"UPDATE"`/`"DELETE"`（非查询操作时填写）
- 连接：`Success` / `Failure`

---

## 条件判断类

### `switch` — 条件分支（表达式规则）
```json
{
  "type": "switch",
  "configuration": {
    "cases": [
      { "case": "msg.score >= 90", "then": "Case1" },
      { "case": "msg.score >= 60", "then": "Case2" }
    ]
  }
}
```
- `cases`：按顺序匹配，第一个成立的分支生效
- `then`：分支名，需与 connections 中的 `type` 一致
- 连接：`Case1`~`Case6`（分支）/ `Default`（无匹配时）/ `Failure`

### `jsSwitch` — JS 路由（脚本决定分支）
```json
{
  "type": "jsSwitch",
  "configuration": {
    "jsScript": "if (msg.type === 'error') return ['Failure'];\nreturn ['Success'];"
  }
}
```
- `jsScript`：返回分支名数组，可同时激活多个分支
- 连接：`Success` / `Default` / 任意自定义分支名

### `msgTypeSwitch` — 消息类型路由
```json
{
  "type": "msgTypeSwitch",
  "configuration": {}
}
```
- 根据 `msgType` 字段值路由到对应连接（连接的 `type` 填消息类型名）
- 连接：以消息类型名作为连接类型

### `exprFilter` — 表达式过滤
```json
{
  "type": "exprFilter",
  "configuration": {
    "expr": "msg.temperature > 50"
  }
}
```
- `expr`：CEL/表达式语法（非 JS）
- 连接：`True` / `False` / `Failure`

---

## 流程控制类

### `for` — 遍历循环
```json
{
  "type": "for",
  "configuration": {
    "range": "${msg.items}",
    "do": "process1",
    "mode": 0
  }
}
```
- `range`：要遍历的数组/范围，支持 `"1..10"`（整数范围）或 `"${msg.list}"` 变量引用
- `do`：循环体首节点 ID（同时需在 connections 中添加 `type: "Do"` 的连接）
- `mode`：`0`=忽略结果 | `1`=追加 | `2`=覆盖 | `3`=异步并行
- 连接：`Do`（循环体入口）/ `Success`（循环完成）/ `Failure`

### `fork` — 并行发散
```json
{ "type": "fork", "configuration": {} }
```
- 将消息广播到所有 `Success` 分支（可以有多个从 fork 出发的 connections）
- 连接：多个 `Success` / `Failure`

### `join` — 汇聚
```json
{
  "type": "join",
  "configuration": {
    "timeout": 0,
    "mergeToMap": false
  }
}
```
- `timeout`：等待超时毫秒（0=无限等待）
- `mergeToMap`：是否合并为 Map（`true` 时将多路输入合并为键值映射）
- 多个 connections 可以指向同一个 join 节点
- 连接：`Success` / `Failure`

### `groupAction` — 节点组（并行组）
```json
{
  "type": "groupAction",
  "configuration": {
    "nodeIds": ["nodeA", "nodeB", "nodeC"],
    "matchRelationType": "Success",
    "matchNum": 0,
    "timeout": 0,
    "mergeToMap": false
  }
}
```
- `nodeIds`：并行执行的节点 ID 列表
- `matchNum`：等待完成的最小数量（0=全部）
- 连接：`Success` / `Failure`

### `flow` — 子规则链调用
```json
{
  "type": "flow",
  "configuration": {
    "targetId": "sub-rule-id",
    "extend": false
  }
}
```
- `targetId`：子规则链的 ID（`ruleChain.root === false` 的链）
- `extend`：是否使用父链的节点池
- 连接：`Success` / `Failure`

### `break` — 终止循环
```json
{ "type": "break", "configuration": {} }
```
- 用于 `for`/`while` 循环体内，终止当前循环
- 连接：`Success`

### `while` — while 循环
```json
{
  "type": "while",
  "configuration": {
    "condition": "msg.count < 10",
    "do": "increment1",
    "mode": 0
  }
}
```
- `condition`：循环条件表达式
- 连接：`Do`（循环体）/ `Success`（退出循环）/ `Failure`

---

## 数据处理类

### `jsTransform` + `exprTransform`
见动作类 `jsTransform`。

### `exprTransform` — 表达式转换
```json
{
  "type": "exprTransform",
  "configuration": {
    "mapping": {
      "result": "msg.value * 2",
      "label": "'prefix_' + msg.name"
    }
  }
}
```
- `mapping`：字段名 → CEL 表达式，结果覆盖 `msg` 中对应字段
- 连接：`Success` / `Failure`

### `metadataTransform` — Metadata 转换
```json
{
  "type": "metadataTransform",
  "configuration": {
    "mapping": {
      "userId": "${msg.id}",
      "timestamp": "${now()}"
    }
  }
}
```
- 将指定字段写入 `metadata`
- 连接：`Success` / `Failure`

### `text/template` — 文本模板
```json
{
  "type": "text/template",
  "configuration": {
    "template": "用户 {{.msg.name}} 的得分是 {{.msg.score}}"
  }
}
```
- Go template 语法，可引用 `.msg`、`.metadata`、`.msgType`
- 输出结果作为新消息体
- 连接：`Success` / `Failure`

### `fieldFilter` — 字段过滤
```json
{
  "type": "fieldFilter",
  "configuration": {
    "dataNames": "temperature,humidity",
    "dataNameType": "msg"
  }
}
```
- 过滤保留/排除指定字段

### `fetchNodeOutput` — 获取节点输出
```json
{
  "type": "fetchNodeOutput",
  "configuration": {
    "nodeId": "target-node-id"
  }
}
```
- 获取指定节点的最新输出数据

---

## 缓存类

### `cacheSet` / `cacheGet` / `cacheDelete`
```json
{
  "type": "cacheSet",
  "configuration": {
    "key": "user_${msg.id}",
    "value": "${msg.data}",
    "ttl": 3600
  }
}
```
- 内存缓存操作，支持变量插值
- `cacheGet` 的 `key` 字段获取缓存值写入 metadata

---

## 外部通信类

### `mqttClient` — MQTT 客户端
```json
{
  "type": "mqttClient",
  "configuration": {
    "server": "tcp://mqtt.example.com:1883",
    "topic": "sensor/${msg.deviceId}",
    "qos": 0,
    "username": "",
    "password": ""
  }
}
```

### `sendEmail` — 发送邮件
```json
{
  "type": "sendEmail",
  "configuration": {
    "smtpHost": "smtp.example.com",
    "smtpPort": 465,
    "username": "user@example.com",
    "password": "",
    "to": "recipient@example.com",
    "subject": "通知",
    "body": "${msg.content}"
  }
}
```

### `ssh` — SSH 执行
```json
{
  "type": "ssh",
  "configuration": {
    "host": "192.168.1.1:22",
    "username": "root",
    "password": "",
    "cmd": "ls -la /tmp"
  }
}
```

### `exec` — 本地命令执行
```json
{
  "type": "exec",
  "configuration": {
    "cmd": "python3 /path/to/script.py",
    "args": ["${msg.input}"]
  }
}
```

---

## RPA 类（DevPilot 自定义）

以下节点由 `backend/internal/services/rulego/node_rpa_*.go` 注册；`url`、`selector`、`debuggerUrl`、`imagePath`、`outputPath`、`x`、`y` 等字段均支持 RuleGo 模板（如 `${msg.field}`、`${metadata.field}`）。成功时通常将 **JSON 字符串** 写入消息 `data`，失败走 `Failure`。

### 浏览器 CDP（`x/rpaBrowser*`）会话与超时

- **同一次规则链执行**且各节点 **`debuggerUrl` 一致**时，后端**复用同一条 CDP 连接并附着同一标签页**，不会在单个浏览器节点结束时关闭该标签（历史上若每步取消 chromedp 上下文，会触发 `CloseTarget` 或拆掉 WebSocket，表现为下一步 **`No target with given id (-32602)`** 或 **`context canceled`**）。
- **`timeoutMs`**：表示该节点**整步操作**的墙钟超时。实现上**不能**用「随后会 `cancel` 掉的 `context.WithTimeout`」包住传给 chromedp 的 `Run`（`RemoteAllocator` 会把该 context 与连接 teardown 绑定）。当前实现用**独立等待**做超时；若触发超时，错误会返回，但底层 CDP 调用**可能仍在进行**，下一节点一般仍可继续；若遇异常状态，可调大 `timeoutMs` 或重试整条链。
- **中途修改 `debuggerUrl`**：会关闭旧会话并按新地址重建。
- **链执行结束**后，会话随 RuleContext 丢弃而释放；Chrome 进程本身仍由你本地命令维持，不会被 DevPilot 退出。

### `x/rpaBrowserNavigate` — 浏览器打开 URL（Chrome CDP）

需先以远程调试方式启动 Chrome/Chromium（例如 `--remote-debugging-port=9222`），链上各 `x/rpaBrowser*` 使用相同 `debuggerUrl` 即可共用上述会话。

```json
{
  "type": "x/rpaBrowserNavigate",
  "configuration": {
    "debuggerUrl": "http://127.0.0.1:9222",
    "url": "https://example.com",
    "timeoutMs": 30000
  }
}
```

- `debuggerUrl`：远程调试入口，默认 `http://127.0.0.1:9222`
- `url`：导航目标地址
- `timeoutMs`：超时毫秒数（至少按 1ms 生效）；语义见本节「浏览器 CDP 会话与超时」
- 成功 `data` 示例：`{"ok":true,"url":"..."}`
- 连接：`Success` / `Failure`

### `x/rpaBrowserClick` — 浏览器按选择器点击

```json
{
  "type": "x/rpaBrowserClick",
  "configuration": {
    "debuggerUrl": "http://127.0.0.1:9222",
    "selector": "button.submit",
    "button": "left",
    "timeoutMs": 30000
  }
}
```

- `selector`：CSS 选择器
- `button`：`left` 或 `right`
- `timeoutMs`：见「浏览器 CDP 会话与超时」
- 成功 `data`：`{"ok":true,"selector":"..."}`
- 连接：`Success` / `Failure`

### `x/rpaBrowserScreenshot` — 浏览器截图

```json
{
  "type": "x/rpaBrowserScreenshot",
  "configuration": {
    "debuggerUrl": "http://127.0.0.1:9222",
    "selector": "",
    "timeoutMs": 30000
  }
}
```

- `selector`：空字符串表示当前视口；非空则截取匹配元素
- `timeoutMs`：见「浏览器 CDP 会话与超时」
- 成功 `data`：`{"ok":true,"image_base64":"...","selector":"..."}`
- 连接：`Success` / `Failure`

### `x/rpaBrowserQuery` — 选择器查询（文本 / HTML / 属性）

```json
{
  "type": "x/rpaBrowserQuery",
  "configuration": {
    "debuggerUrl": "http://127.0.0.1:9222",
    "selector": "h1",
    "queryMode": "text",
    "attributeName": "href",
    "timeoutMs": 30000
  }
}
```

- `queryMode`：`text`（可见文本）、`html`（outer HTML）、`value`（表单控件值）、`attr`（属性，需配合 `attributeName`）
- `timeoutMs`：见「浏览器 CDP 会话与超时」
- 成功 `data`：`{"ok":true,"query_mode":"...","selector":"...","result":"..."}`；`attr` 模式另有 `attribute` 字段
- 连接：`Success` / `Failure`

### `x/rpaOcr` — Tesseract OCR

本机需安装 `tesseract` 及所需语言包；可通过 `tesseractPath` 指定可执行文件。

```json
{
  "type": "x/rpaOcr",
  "configuration": {
    "imagePath": "/tmp/cap.png",
    "lang": "eng",
    "tesseractPath": "tesseract"
  }
}
```

- `imagePath`：图像文件路径；**留空**时从消息 `data` 读取：纯 Base64 字符串，或 JSON 中的 `image_base64` 字段
- `lang`：如 `eng`、`chi_sim+eng`
- 成功 `data`：`{"ok":true,"text":"..."}`；路径读写受引擎 `filePathWhitelist` / `workDir` 等与文件节点相同规则约束
- 连接：`Success` / `Failure`

### `x/rpaScreenCapture` — 屏幕截图（仅 macOS）

使用系统 `/usr/sbin/screencapture`。非 macOS 上节点会注册但执行失败。

```json
{
  "type": "x/rpaScreenCapture",
  "configuration": {
    "mode": "full",
    "top": 0,
    "left": 0,
    "width": 800,
    "height": 600,
    "outputPath": ""
  }
}
```

- `mode`：`full` 全屏，`region` 区域（`top,left,width,height` 对应 `screencapture -R` 矩形）
- `outputPath`：非空则写入该路径（须通过路径校验）；无论是否写文件，成功时 `data` 均含 `image_base64`
- 连接：`Success` / `Failure`

### `x/rpaMacWindow` — macOS 窗口与应用（AppleScript）

非 macOS 上执行失败。返回应用名、窗口标题等**语义信息**，非 Windows 式数值句柄。

```json
{
  "type": "x/rpaMacWindow",
  "configuration": {
    "action": "frontmost",
    "appName": "",
    "windowTitle": ""
  }
}
```

- `action`：`frontmost`（前置应用与窗口标题）、`activate`（激活 `appName`，可选按 `windowTitle` 尝试前置窗口）、`list`（列出进程与窗口文本）
- `appName` / `windowTitle`：支持模板
- 成功 `data`：JSON，`frontmost` 时常含 `app_name`、`window_title`
- 连接：`Success` / `Failure`

### `x/rpaDesktopClick` — 屏幕坐标点击（仅 macOS）

通过 `System Events` 的 `click at {x,y}`，需为 DevPilot 授予**辅助功能**等权限。

```json
{
  "type": "x/rpaDesktopClick",
  "configuration": {
    "x": "100",
    "y": "200"
  }
}
```

- `x` / `y`：整数像素，字符串形式且支持模板（解析后为整数）
- 成功 `data`：`{"ok":true,"x":100,"y":200}`
- 连接：`Success` / `Failure`
