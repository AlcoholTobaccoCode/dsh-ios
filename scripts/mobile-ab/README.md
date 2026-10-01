# Mobile UI 回归对照原型

共用独立 iOS driver，DeepSeek flash 决定下一步；`dual` 增加 Jev gate，`deepseek` 完全不请求 Jev。

```sh
PATH=/Users/duqings/.nvm/versions/node/v24.19.0/bin:$PATH node --test scripts/mobile-ab/*.test.mjs
PATH=/Users/duqings/.nvm/versions/node/v24.19.0/bin:$PATH node scripts/mobile-ab/run.mjs search deepseek UNIQUE-RUN-ID --live
```

用例参数：`search`（无结果→有效查询→文档预览）、`favorite`（图片→收藏列表→取消）、`project`（创建→修改描述重开→删除）。项目名为 `AB` + run ID。重复 run ID 拒绝覆盖。

目前是固定设备/固定实验产物的验证原型；运行前手工准备相同屏幕起点，见 `artifacts/mobile-ab/FINAL-PLAN.zh.md`。不得直接用于无人值守 CI，也不要对含真实任务或文件的项目运行删除用例。

- 外部 env 仅在运行时读取，不写日志，不修改凭据文件。
- 每次独占 device.lock，最多55步/7分钟。无进展停止，截断 AX 停止。
- 候选元素新鲜度、输入字段、保存内容及删除对象范围由本地检查约束；这些校验两组相同。
- 每次保存 sourceHash、截图、原始 AX、模型调用/用量、提议、Jev gate、写入意图、结果；`awaiting_independent_review` 不代表通过。
- 完整成功须独立逐项检查截图/历史/状态，记录 `review.json`。脚本断言只作初筛，不能替代业务验收。
- 删除弹窗若无独立 AX 按钮、输入丢字或目标标识不可靠，应记失败并停止，不能拿坐标猜测凑通过。
- 当前测试未覆盖长按、原生文本替换、稳定 testID、后端独立断言、自动环境重置、真机矩阵、跨多次运行统计和完整失败恢复。

历史试跑/校准日志与冻结正式对照分开统计；详情见 artifacts 下报告。

## Jev 第二轮 prompt

`jev-prompt.mjs` 按官方原子问题建议，将操作相关性/授权范围分开，将 checkpoint 拆成页面分类、正文语义和持久化操作顺序；输入保留原始文本并补英文控件释义，真实 driver 回执与模型提议分开。精确字段/文件名继续由本地断言校验。Jev 为纯文本模型，不负责像素渲染验收。

门槛仍为各必需 Choice confidence 的最小值 >= 0.75，不代表已校准业务正确率。选项、问题和上下文都变化，因此本轮评估的是整体审核方案，而非纯措辞差异。查看 `artifacts/mobile-ab/jev-v2/PLAN.zh.md`、回放与正式实测报告。旧实现快照与新冻结源码均保留在该目录，旧结果不覆盖。
