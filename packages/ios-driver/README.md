# 独立 iOS driver

由 [ZSeven-W/dsh-ios](https://github.com/ZSeven-W/dsh-ios) 的核心源码构建，保留 MIT 版权与第三方声明。不需要 DSH 宿主或其 React 面板；不包含模型或 Agent 循环。此包用于本地分发，未发布 npm。

直接运行依赖为 serve-sim 与 ws。serve-sim 0.1.46 的 sonner 依赖会通过 npm peer 安装带入 React/React DOM；因此不能声称整棵依赖树没有 React。driver 入口本身不导入 React 或 DSH，客户端面板不参与本包构建。

在本目录 `npm install && npm run build && npm pack`。只需本目录的依赖；构建从仓库 `src/` 读取入口依赖闭包，不维护第二份源码。tarball 可在仓库外安装。

```js
import { createIosQaBackend } from '@alcoholtobaccocode/ios-driver';
import { SimHostController } from '@alcoholtobaccocode/ios-driver/sim-host';
const sim = new SimHostController();
const driver = createIosQaBackend({ sim });
try { console.log(await driver.discover()); }
finally { await driver.dispose(); await sim.dispose(); }
```

Node >=24.11，设备操作需 macOS/Xcode 与原项目的 AXe/serve-sim/WDA 前置条件。轻量模拟器输入仍有原项目的字符限制；抽包不改变输入能力。可选 OCR 入口为 `/ocr`，Swift 资源随包携带。DSHPLUGIN_/DSH_ 环境变量继续兼容上游。
