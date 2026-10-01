# Flash + Jev 十轮 iOS 演示

**准备命令不会调用模型、连接或操作设备。必须等用户明确说“跑”后，才能使用 `run --live`。** 此版为实验运行器，正式效果尚未实测。

2026-09-24 按 Mobile 当前业务复核后的正式验收步骤见本地 `artifacts/dual-model/MOBILE-BUSINESS-VALIDATION.zh.md`。原型尚未覆盖云盘搜索输入、确认卡输入、真实产物名称映射与来源任务回跳；不能把下面的原型 finish 状态当成完整业务验收通过。人工接管须单独记录。

## 分工与范围

Flash 使用截图、原始 AX 树与阶段目标生成一个动作；Jev 使用相同文字证据审核该动作；独立 driver 执行。首版对应审核模式 B，目的是展示双模型效果，不预先承诺更快。App 内生成文章、图片仍由 Ottermind 自己的服务处理，DS/Jev 是外部测试控制器，并没有替换 App 内模型。

模拟器：iPhone 17 / iOS 26.4，UDID `063DC27F-4CD5-4465-95B7-71C1C9B1BE27`；App：`ai.ottermind.mobile.test`。启动前需由操作者确认模拟器已启动、test Metro 可用、App 已登录。运行器遇到其他前台 App 会停止，不自行登录。已有 native 底座是否最新需启动时核对。

## 准备

Node >=24.11；在仓库根目录：

```sh
npm --prefix packages/ios-driver ci --ignore-scripts
npm --prefix packages/ios-driver run build
node --test scripts/dual-model/*.test.mjs
node scripts/dual-model/cli.mjs prepare --env /absolute/path/to/.env
```

只读取 DEEPSEEK_API_KEY、DEEPSEEK_BASE_URL、DEEPSEEK_MODEL、JEV_API_KEY、JEV_BASE_URL。Jev 固定 `jev-1.13.0`；外部文件的 `jev-latest` 不用于本次实验。不修改外部 env，不拷贝密钥，不使用其中其他模型配置或未核对的价格参数。

清单输出到 `artifacts/dual-model/prepared.json`，包含十轮原文、四份期望产物和模型端点。默认运行编号含时间，可用 `--run-id` 指定仅字母、数字、连字符的编号。

## 正式启动（现在不执行）

```sh
node scripts/dual-model/cli.mjs run --live --env /absolute/path/to/.env
```

必须保持 Simulator 可见，以便观察。一个新任务内连续十次用户发言，每次等待回复完成：主题计划 → 文章结构 → 初版图片 → 配图文案 → 文章初稿文件 → 修改要求 → 最终图片 → 发布短文案 → 最终文章文件 → 文件索引。然后打开云盘，逐一打开两张图片和两份 Markdown 文档。输入为英文指令，输出要求中文，避开当前轻量模拟器输入通道的中文限制。

不自动运行 A/B 三遍，不额外创建测试任务。错误、登录失效、文件缺失、输入不匹配、API 超时或不支持的动作均停止，不盲目重发。用 Ctrl+C 中断，释放本运行器自有驱动资源。硬退出遗留 lock 时，先核对该 PID 已退出，再人工移除锁；不要启动第二个控制器抢同一设备。

## 可见结果与验收

终端逐步显示 Flash 动作原因、Jev 选择/置信度、真实动作结果和模型 usage。证据在 `artifacts/dual-model/<runId>/`，含截图、UI 状态、JSONL 审计、最终 result。观察文件、决策及动作通过 step 与时间关联。文件名带运行编号，防止误认历史文件。

运行器最多 300 步、45 分钟；每次模型请求限时 60 秒。Jev 审核阈值 0.75 仅用于受监督演示，未校准为正确率。执行前重新验证前台与元素，发送前精确核对草稿；仍不能保证消除观察和动作之间的所有 UI 竞争。

模型声称预览成功只记作证据候选，最终状态是 `awaiting_visual_review`。操作者须实际检查截图/模拟器：

- 同一新任务完整出现 10 次用户发言及对应完成回复，无重复发送。
- 云盘出现本次运行的两张图片与两份文章；每份可打开，图片实际渲染，文章可阅读，最终文章包含约定的修改。
- 不能把聊天承诺、空文件、加载占位、历史文件或模型自评算作通过。文件格式若为 JPEG 等，按相同 basename 核对实际格式。
- 报告分别列自动执行效果、人工介入、模型耗时、设备耗时、生成等待和失败点。只记录 tokens，不用未核对的价格宣称真实账单。

Jev 不能看图，审核依赖文本证据，不能证明图片内容或界面无遮挡；Flash 与人工承担视觉检查。AX 缺失、按钮无标识、文档外部打开、动画、中文输入和文件产物能力都有可能成为首次实机试跑的阻塞点，届时按证据处理，不能计为已通过。

## 现场续跑与已知限制

`run --live --env PATH --resume artifacts/dual-model/RUN_DIRECTORY` 从已停止的匹配任务续跑，使用当前 prepared.json 的同一场景。只有明确的发送前草稿校验失败或检查点证据失败可从 failed 恢复；未落地的 submit_intent 拒绝恢复。首次观察须含任务编号，续跑写独立目录，不覆盖前次记录。需要先核对 App 现场和已发送轮次，不能拿续跑机制绕过业务错误。

模型看到的 AX 节点带原始 index，文字证据筛选到当前屏幕。Jev 每次只判断一个具体问题；普通回复末尾的追问与工具确认卡分开。阈值仍为 0.75，未经数据集校准。仅允许现场确认的英文输入法 `same basename` → `same base name` 和 `actual filenames and file links` → `actual file names and file links` 改写，文件名和其余文字仍逐字检查；实际草稿写入审计。

真实运行中的人工导航、恢复及修改参数都必须写进报告，不能当作无人干预成功。
