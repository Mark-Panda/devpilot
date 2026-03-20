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
