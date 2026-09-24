# Fork 维护与开发约定

本仓库是 [ZSeven-W/dsh-ios](https://github.com/ZSeven-W/dsh-ios) 的 fork。
保留原作者的版权、LICENSE 和第三方声明；原始项目文档继续适用。

## 分支职责

- `main-fork`：上游 `ZSeven-W/dsh-ios` 的 `main` 镜像分支，只保存上游历史。
  不在此分支开发，不向此分支合入 fork 的改动。
- `main`：本 fork 的默认开发分支。当前用户要求后续调整落在此分支。
  临时功能分支如有需要，也以此分支为基线，最终合回此分支。
- 上游更新由 `.github/workflows/sync-upstream.yml` 每 6 小时同步到远程
  `main-fork`，也可在 GitHub Actions 手动运行 `Sync upstream main`。
  同步配置只保存在 `main`，不会添加到 `main-fork`。
- 自动同步不合并到 `main`。需要吸收上游更新时，先审查差异，再按当前任务授权
  将 `origin/main-fork` 合入 `main` 并验证。不得强制覆盖 `main`。
- `main-fork` 出现额外提交、分叉或上游重写历史时，同步应失败并由人检查。

## 本地远程与同步

- `origin`：`https://github.com/AlcoholTobaccoCode/dsh-ios.git`
- `upstream`：`https://github.com/ZSeven-W/dsh-ios.git`，本地已禁用向其推送。
- 默认工作在 `main`，跟踪 `origin/main`；本地 `main-fork` 跟踪 `origin/main-fork`。
- GitHub Actions 更新的是远程分支。本地查看最新上游镜像时先运行
  `git fetch origin --prune`；`origin/main-fork` 即为最新远程状态。

## 自动同步运行说明

- 北京时间计划在每天 02:17、08:17、14:17、20:17 执行，GitHub 调度可能延迟。
- 工作流使用本仓库的短期 `GITHUB_TOKEN`，仅申请 `contents: write`；不保存个人令牌。
- 同步前核对父仓库、上游默认分支和提交关系，同步后核对双方提交 SHA。
  工作流摘要保存触发方式、操作者、同步前后的提交及检查结果。
- 定时任务依赖工作流位于默认分支 `main` 且处于启用状态。
  GitHub 可能在公开仓库连续 60 天没有活动后禁用定时工作流；届时需重新启用。
- 提交信息使用中文 Conventional Commits，标题概括改动，正文说明具体内容。
