# cz_lint

Figma 字体与颜色规范检查插件。从设计中提取字体与颜色、维护标准库，并扫描页面中未使用 Typography 或未使用「有名称」填充样式的文本，辅助设计规范落地。

---

## 开发背景

作为使用方（程序员/协作方），需要确保拿到的设计稿符合团队已制定的规范（如统一使用 Typography、字体与颜色落在约定范围内等），否则开发落地或后续维护时容易产生偏差。本插件从使用方视角出发：用「标准库」维护你认可的字体和颜色集合，用「字体校验」扫描当前页中未按规范使用的文本，便于发现问题并推动设计侧整改。

---

## 功能概览

### 1. 提取（字体 + 颜色）

- **选中即预览**：在 Figma 中选中任意 Frame 或 Layer，插件自动递归遍历子节点。
  - **字体**：提取所有文本的字体信息（family、字重、样式、字号、Typography 名称），去重后展示；勾选后「确认添加到字体库」。
  - **颜色**：提取所有使用「有名称」填充样式的 layer（矩形、文本、Frame 等），去重后展示样式名称；勾选后「确认添加到颜色库」。
- 支持全选/取消全选，无选区时列表自动清空。

### 2. 标准库（字体库 + 颜色规范）

- **持久化**：字体库与颜色库保存在 Figma 插件本地（`figma.clientStorage`），关闭文件后再次打开仍可沿用。
- **管理**：在「标准库」Tab 中查看已保存的字体与颜色，支持单条删除或一键清空。
- **用途**：作为设计规范中的标准集合，为后续扩展（如与校验规则联动）提供数据基础。

### 3. 字体校验

- **扫描范围**：当前页（Page）下所有子节点，递归查找文本节点（TEXT）。
- **校验规则**：
  - **Typography**：文本是否绑定有效的 Typography 样式（有名称）。
  - **颜色**：文本填充是否使用「有名称」的填充样式（未命名或 mixed 视为不规范）。
- **结果展示**：列出父级最外层 Frame 名称、文本节点名、文本内容前 50 字，并分别标记 Typography / 颜色为 ✅ 或 ❌。
- **交互**：点击某条结果可定位到画布中的该文本节点；支持复制 Frame 名称。

---

## 技术栈与结构

| 项目     | 说明 |
|----------|------|
| 语言     | TypeScript（编译为 `code.js`） |
| 运行环境 | Figma Plugin API（主线程 `code.ts` + UI `ui.html`） |
| 存储     | `figma.clientStorage`（仅本地，无网络） |
| 能力     | `inspect`、`documentAccess: dynamic-page`、`editorType: ["dev"]` |

- **`code.ts`**：字体/颜色提取与去重、标准库读写、页面扫描校验、与 UI 的 `postMessage` 通信。
- **`ui.html`**：三栏 Tab（提取 / 标准库 / 字体校验），列表渲染与用户操作回调。

---

## 使用方式

### 环境要求

- 已安装 [Node.js](https://nodejs.org/)（含 npm）。

### 安装与构建

```bash
npm install
npm run build
```

开发时监听文件变化：`npm run watch`。

### 在 Figma 中加载

1. Figma → **Plugins → Development → Import plugin from manifest…**，选择本目录下的 `manifest.json`。
2. 之后在 **Plugins → Development** 下找到 **cz_lint** 并运行。
3. **提取**：选中 Frame 或 Layer，在「提取」中查看字体与颜色，勾选后确认添加。
4. **标准库**：在「标准库」中查看/删除已保存的字体与颜色。
5. **字体校验**：在「字体校验」中点击「开始扫描」，查看不合规项并点击定位到节点。

---

## 脚本说明

| 命令 | 说明 |
|------|------|
| `npm run build` | 编译 TypeScript 为 `code.js` |
| `npm run watch` | 监听源码并持续编译 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 检查并自动修复 |

---

## 参考

- [Figma Plugin 快速入门](https://www.figma.com/plugin-docs/plugin-quickstart-guide/)
- [Figma Plugin API](https://www.figma.com/plugin-docs/api/)
