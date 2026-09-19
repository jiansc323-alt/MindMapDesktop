# MindMap Desktop

基于开源核心库 [simple-mind-map](https://github.com/wanglin2/mind-map)(MIT)自建的 **Windows 免安装**思维导图客户端。
界面为 Vue 3 + TypeScript 轻量实现,不依赖也不复用官方 Web 应用。

> **与官方的关系**:本项目是独立的第三方开源实现。[wanglin2/mind-map](https://github.com/wanglin2/mind-map) 的官方桌面客户端是闭源的,本项目**只使用其开源核心库 `simple-mind-map` 与公开 API**,不包含、不反编译、不复用任何闭源代码或资源。
> 本项目与 SimpleMindMap 官方无隶属关系;`.smm` 文件格式与官方保持互通。

## 下载

到 [Releases](releases) 下载 `MindMapDesktop-portable-<version>.exe`,**双击即用**,不需要安装、不需要管理员权限,配置和数据不会写进 Program Files。

- 未做代码签名:首次运行 Windows SmartScreen 可能弹"已保护你的电脑 → 更多信息 → 仍要运行"。
- 单个 exe 约 100 MB,因为内含 Electron 运行时。

## 功能

- 思维导图编辑:增删节点、拖拽排序、撤销/重做、逻辑结构图布局
- 文件:打开/保存/另存为 `.smm`(与官方格式互通)、导出 PNG、拖拽文件到窗口打开
- **自动保存**:改动防抖 800ms 直接落盘(先写临时文件再改名覆盖,进程被杀也不会留下半截文件),关窗前再同步补写一次;全程没有任何"是否保存"弹窗。新建/未命名文档只在首次改动时弹一次"另存为"让你选位置
- 左侧"最近打开"侧边栏(双击打开,可隐藏)+ 启动自动恢复上次编辑的导图
- 右侧节点备注侧边栏:Ctrl+T 或点击节点右上角泡泡编辑当前节点备注
- 节点右键菜单标记"已完成",对勾画在节点文本后方,随文件保存、可撤销、导出 PNG 可见
- 主题切换:默认(浅)/深色/经典蓝/清新绿,打开文件时按文件内主题还原
- 视图:适应画布 / 放大 / 缩小;打开任意导图自动居中并在超出画布时缩小
- 原生菜单 + 快捷键:Ctrl+N / O / S / Shift+S / E / Z / Y / T / 0 / +/−

## 开发

要求:Node.js `^20.19.0 || >=22.12.0`(实测 24.x)、Windows。

```bash
npm install        # .npmrc 已配 Electron 二进制国内镜像,国内网络可直接装;境外可删掉该文件
npm run dev        # 起 Vite + 自动拉起 Electron 开发窗口
npm run typecheck  # vue-tsc 类型检查
npm run build      # 产出 dist/ 与 dist-electron/
npm run dist       # 打包 release/MindMapDesktop-portable-<version>.exe
```

目录结构与各模块职责见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 数据存储

- 导图数据就是官方的 `.smm`(JSON),你可以完全用文件管理,不锁在私有格式里。
- 应用配置(最近打开列表、上次编辑的文件)在 `%APPDATA%\mind-map-desktop\state.json`;尚未做成"随 exe 走"的绿色存储。
- 兼容性说明:"已完成"对勾写的是自定义节点字段 `data.data.done`,官方 Web 版不识别这个字段(数据不会丢,回到本客户端仍生效)。

## 已知限制

- 仅支持 `.smm/.json` 打开;xmind / markdown 导入导出未实现。
- 未注册富文本(RichText)、公式(Formula)、小地图(MiniMap)等核心库插件。
- 自动保存无冲突检测:同一文件被两个窗口同时打开时,后落盘的一方会覆盖另一方。
- 未做代码签名与应用图标。

更细的待办清单见 [DEVELOPMENT.md §10](DEVELOPMENT.md)。

## 许可与致谢

- 本项目采用 [MIT 许可](LICENSE)。
- 核心渲染能力来自 [simple-mind-map](https://github.com/wanglin2/mind-map)(MIT,Copyright (c) 2021-2023 The MindMap Team),随包附带的第三方许可声明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 免责声明

本项目仅供学习与个人使用,按"现状"提供,不含任何明示或暗示的保证。请在符合 `simple-mind-map` MIT 许可的前提下使用、修改与分发本代码,并保留原始版权与许可声明。
