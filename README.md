# Growth Agent

个人微信小号推广草稿助手，用于微信小程序冷启动推广。

它做三件事：

- 接入微信小程序资料，并生成推广活动。
- 提供 WeChatFerry/WCF 本机桥接入口，同步微信群/好友/朋友圈目标。
- 管理白名单群、好友、朋友圈目标。
- 自动生成带 `source` 来源码的小程序推广草稿，并记录复制、发送、跳过状态。

它不做这些事：

- 不 hook 微信客户端。
- 不绕过验证码或风控。
- 不自动点击发送。
- 不批量骚扰陌生人。

## 运行

```powershell
cd E:\growth-agent
npm start
```

打开：

```text
http://localhost:4788
```

默认数据存储在：

```text
E:\growth-agent\data\growth-agent.sqlite
```

`data/` 已经被 `.gitignore` 排除，不会上传到 GitHub。

## 接入微信小程序

在首页“微信小程序接入”的“授权信息”输入框里粘贴：

```text
AppID: wx1234567890abcdef
AppSecret: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

输入完成后系统会自动检测，也可以点击“检测并导入”。

检测成功后：

- 后端会通过微信官方 `access_token` 接口验证 AppID/AppSecret。
- 小程序资料会自动进入资料库。
- 活动表单会自动填入该小程序。
- AppSecret 只保存在本机 SQLite 的 `wechat_credentials` 表，不会返回到页面列表，也不会上传 GitHub。

注意：页面路径同步属于微信官方接口能力，可能受账号权限或接口范围影响。如果页面路径同步不到，系统会先使用 `/pages/index/index`，你后续可以按实际入口路径调整活动。

## 推广流程

1. 先接入小程序；授权成功后系统会自动创建活动。
2. 在“个人微信连接”里启动扫码登录；网页不会生成微信二维码，真实二维码只在官方 Windows 微信客户端里显示。
3. 扫码后确认 WeChatFerry/WCF 本机桥接状态。
4. 同步微信群目标，或者手动补充微信群、好友、朋友圈。
5. 在“推广活动”里点击“生成草稿”。
6. 在“草稿队列”里复制草稿。
7. 粘贴到 Windows 微信，人工确认后发送。
8. 回到页面点击“标记发送”。

## 微信会话助手

Windows 微信已经登录后，还需要单独启动 WeChatFerry/WCF 的本机 HTTP 桥接器，网页才能同步显示微信群/好友会话。默认探测地址：

```powershell
$env:WCF_HTTP_URL="http://127.0.0.1:9999"
```

兼容性提醒：当前 WCF 接入面向 Windows 微信 3.9.x 环境。微信 4.x 客户端，例如 `4.1.10.53`，不能只靠打开 `127.0.0.1:9999` 接入；如果必须保留 4.x，需要改走 UI 自动化/手工复制模式，或者准备一个兼容 WCF 的 3.9.x 微信环境。

如果你的 wcf-http 接口路径不同，可以按实际服务改：

```powershell
$env:WCF_STATUS_PATH="/api/status"
$env:WCF_CONTACTS_PATH="/api/contacts"
$env:WCF_MESSAGES_PATH="/api/messages"
```

“微信会话助手”支持：

- 检测 WCF 本机桥接器是否在线。
- 同步微信群/好友会话到网页工作台。
- 展示最近消息预览。
- 选择推广活动后生成 AI 回复草稿，并自动带上小程序路径和 source 来源码。
- 复制草稿到 Windows 微信里人工确认发送。

大模型默认使用本地模板；如果要接 DeepSeek，可以直接在页面左侧“DeepSeek 模型配置”里填：

- API Base URL：`https://api.deepseek.com`
- 模型：`deepseek-v4-flash`，需要更强推理时可改 `deepseek-v4-pro`
- API Key：DeepSeek 控制台生成的 `sk-...`

API Key 只保存在本机 SQLite，不会显示回页面、不会上传 GitHub。

也可以用环境变量配置：

```powershell
$env:AI_API_BASE_URL="https://api.deepseek.com"
$env:AI_API_KEY="你的 DeepSeek API Key"
$env:AI_MODEL="deepseek-v4-flash"
```

这个系统没有自动发送微信消息的接口。AI 只生成建议文本，避免误发、刷屏和账号风险。

如果页面显示“未启动 WCF HTTP 桥接器”，说明 Windows 微信虽然已登录，但本机还没有启动 WCF/wcf-http 服务。需要先启动桥接器，让它监听 `http://127.0.0.1:9999`，再回到页面点击“检测 WCF”。如果你的桥接器端口不是 9999，启动本应用前设置：

```powershell
$env:WCF_HTTP_URL="http://127.0.0.1:你的端口"
```

批量添加白名单时，可以一行一个：

```text
A青岛装修合作共赢群
A南京工程装修资源整合群
A深圳装修设计交流群
```

也可以粘贴用逗号、分号分隔的列表。对于 `A... A...` 这种连续群名，系统会尝试按空格前的 `A` 自动拆分。添加错了，可以在“白名单目标”里点“删除”。

## 测试

```powershell
npm test
```

测试覆盖：

- 微信小程序授权导入接口。
- AppSecret 本地保存且不返回前端。
- 旧 SQLite 数据库迁移。
- 来源码和小程序路径生成。
- 推广草稿生成。
- 白名单、重复目标、每日上限拦截。
- 个人微信连接不会返回或渲染假的扫码二维码。
- 本地 API。

## 安全边界

这个工具的边界是“草稿自动化”，不是“微信自动群发”。当前个人微信扫码采用方案 A：官方 Windows 微信客户端 + WeChatFerry/WCF 本机桥接器。网页不伪造、不生成微信扫码二维码；真实扫码只在官方 Windows 微信客户端完成。系统负责记录连接状态、同步转发目标和生成草稿，不自动读取消息、不自动发送消息。后续如果再接 Wechaty，也应把 Wechaty 放在上层机器人框架位置，底层仍优先使用 WCF 这类 Windows 本机桥接器，并保持“写入草稿、人工确认、不自动发送”的边界。
