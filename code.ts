// Figma 字体库提取插件
// 读取选中节点中的所有文本，提取字体信息，用户确认后保存到字体库

// 字体库存储（使用 clientStorage 持久化存储）
let fontLibrary: FontLibraryItem[] = [];

// 颜色库存储
let colorLibrary: ColorLibraryItem[] = [];

// 颜色库项接口（规范的颜色都有名称，对应 Figma 的 Paint 样式）
interface ColorLibraryItem {
  id: string;
  styleId: string;
  name: string;
  confirmedAt: number;
}

// 字体信息接口
interface FontInfo {
  name: string;
  fontWeight: number;
  style: string;
  size: number;
  typographyName?: string; // Typography 样式的名称
}

// 字体库项目接口
interface FontLibraryItem extends FontInfo {
  id: string;
  confirmedAt: number;
}

// 初始化：加载已保存的字体库与颜色库
async function initLibraries() {
  const savedFonts = await figma.clientStorage.getAsync('fontLibrary');
  if (savedFonts) fontLibrary = savedFonts;
  figma.ui.postMessage({ type: 'library-update', data: fontLibrary });

  const savedColors = await figma.clientStorage.getAsync('colorLibrary');
  if (savedColors) colorLibrary = savedColors;
  figma.ui.postMessage({ type: 'color-library-update', data: colorLibrary });
}

// 保存字体库
async function saveFontLibrary() {
  await figma.clientStorage.setAsync('fontLibrary', fontLibrary);
  figma.ui.postMessage({
    type: 'library-update',
    data: fontLibrary
  });
}

// 显示 UI
figma.showUI(__html__, { width: 450, height: 600 });

// 初始化
initLibraries();

// 缓存本地文本样式与填充样式
let cachedTextStyles: TextStyle[] | null = null;
let cachedPaintStyles: PaintStyle[] | null = null;

// 获取 Typography 样式名称
async function getTypographyName(node: TextNode): Promise<string | undefined> {
  // 获取节点的文本样式 ID
  const textStyleId = node.textStyleId;
  if (textStyleId && typeof textStyleId === 'string') {
    // 使用异步 API 获取本地文本样式
    if (!cachedTextStyles) {
      cachedTextStyles = await figma.getLocalTextStylesAsync();
    }
    const style = cachedTextStyles.find(s => s.id === textStyleId);
    if (style) {
      return style.name;
    }
  }
  return undefined;
}

// 根据 fillStyleId 获取填充样式名称（用于颜色规范：有名称即规范）
async function getPaintStyleNameById(fillStyleId: string): Promise<string | undefined> {
  if (!cachedPaintStyles) {
    cachedPaintStyles = await figma.getLocalPaintStylesAsync();
  }
  const style = cachedPaintStyles.find(s => s.id === fillStyleId);
  return style && style.name ? style.name : undefined;
}

// 递归遍历节点，提取所有文本节点的字体信息
async function extractFontsFromNode(node: SceneNode): Promise<FontInfo[]> {
  const fonts: FontInfo[] = [];
  
  // 如果是文本节点
  if (node.type === 'TEXT') {
    const fontName = node.fontName;
    const fontSize = node.fontSize;
    const typographyName = await getTypographyName(node);
    
    // fontName 可能是 Symbol (mixed) 或 FontName 对象
    if (typeof fontName === 'object' && fontName !== null) {
      fonts.push({
        name: fontName.family,
        fontWeight: fontName.style === 'Bold' ? 700 : fontName.style === 'Medium' ? 500 : fontName.style === 'Light' ? 300 : 400,
        style: fontName.style,
        size: typeof fontSize === 'number' ? fontSize : 0,
        typographyName: typographyName
      });
    }
  }
  
  // 如果节点有子节点，递归遍历
  if ('children' in node && Array.isArray(node.children)) {
    for (const child of node.children) {
      const childFonts = await extractFontsFromNode(child as SceneNode);
      fonts.push(...childFonts);
    }
  }
  
  return fonts;
}

// 去重字体列表
function deduplicateFonts(fonts: FontInfo[]): FontInfo[] {
  const seen = new Set<string>();
  return fonts.filter(font => {
    const key = `${font.name}-${font.style}-${font.size}-${font.typographyName || ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 处理选中节点 - 提取字体供预览
async function processSelectionForPreview() {
  // 清空缓存，确保获取最新的文本样式
  cachedTextStyles = null;
  
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'no-selection' });
    figma.ui.postMessage({ type: 'preview-colors', data: [] });
    return;
  }
  
  const allFonts: FontInfo[] = [];
  
  // 遍历所有选中的节点
  for (const node of selection) {
    const fonts = await extractFontsFromNode(node);
    allFonts.push(...fonts);
  }
  
  // 去重
  const uniqueFonts = deduplicateFonts(allFonts);
  
  // 发送字体预览
  figma.ui.postMessage({ type: 'preview-fonts', data: uniqueFonts });

  // 同时提取并发送颜色预览（与字体一致：选中即出结果）
  const colorPreview = await extractColorsFromSelection();
  figma.ui.postMessage({ type: 'preview-colors', data: colorPreview });
}

// 监听选择变化 - 自动预览字体与颜色
figma.on('selectionchange', () => {
  processSelectionForPreview().catch(console.error);
});

// 颜色预览项（仅包含有名称的填充样式）
interface ColorPreviewItem {
  styleId: string;
  name: string;
}

// 从选中 Frame（或任意节点）内递归遍历所有 layer，采集「有名称」的填充样式
async function extractColorsFromSelection(): Promise<ColorPreviewItem[]> {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) return [];

  // 先加载本地填充样式，保证后续能正确解析 styleId → name
  cachedPaintStyles = await figma.getLocalPaintStylesAsync();
  const seen = new Set<string>();
  const items: ColorPreviewItem[] = [];

  function collect(node: SceneNode) {
    // 用类型断言读取 fillStyleId（Frame/Rectangle/Text 等均有，部分类型在 typings 中可能未声明）
    const raw = (node as { fillStyleId?: string | symbol }).fillStyleId;
    if (typeof raw === 'string' && !seen.has(raw)) {
      const style = cachedPaintStyles!.find(s => s.id === raw);
      if (style && style.name) {
        seen.add(raw);
        items.push({ styleId: raw, name: style.name });
      }
    }
    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        collect(child as SceneNode);
      }
    }
  }

  for (const node of selection) {
    collect(node);
  }
  return items;
}

// 保存颜色库
async function saveColorLibrary() {
  await figma.clientStorage.setAsync('colorLibrary', colorLibrary);
  figma.ui.postMessage({ type: 'color-library-update', data: colorLibrary });
}

// 校验结果接口（Typography 与颜色均会校验）
interface ValidationResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  textContent: string;
  parentName?: string;
  frameName?: string;
  typographyInvalid: boolean; // 未使用 Typography 样式
  colorInvalid: boolean;     // 未使用有名称的颜色（填充样式）
}

// 获取节点所在的最外层 Frame 名称（从当前节点向上遍历到根，取最后一个 Frame）
function getFrameName(node: SceneNode): string | undefined {
  let current: SceneNode | null = node;
  let outermostFrameName: string | undefined;
  while (current) {
    if (current.type === 'FRAME') {
      outermostFrameName = current.name;
    }
    current = current.parent as SceneNode | null;
  }
  return outermostFrameName;
}

// 递归扫描页面，找出 Typography 或颜色不规范的文本节点
async function scanPageForValidation(): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  async function scanNode(node: SceneNode, parentName?: string) {
    if (node.type === 'TEXT') {
      let typographyInvalid = true;
      const textStyleId = node.textStyleId;
      if (textStyleId && typeof textStyleId === 'string') {
        if (!cachedTextStyles) {
          cachedTextStyles = await figma.getLocalTextStylesAsync();
        }
        const style = cachedTextStyles.find(s => s.id === textStyleId);
        if (style && style.name) typographyInvalid = false;
      }

      let colorInvalid = true;
      const fillStyleId = node.fillStyleId;
      if (fillStyleId && typeof fillStyleId === 'string') {
        if (!cachedPaintStyles) {
          cachedPaintStyles = await figma.getLocalPaintStylesAsync();
        }
        const paintStyle = cachedPaintStyles.find(s => s.id === fillStyleId);
        if (paintStyle && paintStyle.name) colorInvalid = false;
      }

      if (typographyInvalid || colorInvalid) {
        results.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          textContent: node.characters.substring(0, 50),
          parentName: parentName,
          frameName: getFrameName(node),
          typographyInvalid,
          colorInvalid
        });
      }
    }

    if ('children' in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        await scanNode(child as SceneNode, node.name);
      }
    }
  }

  for (const node of figma.currentPage.children) {
    await scanNode(node);
  }

  return results;
}

// 监听 UI 消息
figma.ui.onmessage = async (msg) => {
  switch (msg.type) {
    case 'confirm-fonts':
      // 用户确认添加字体到库
      const fontsToAdd: FontInfo[] = msg.data;
      for (const font of fontsToAdd) {
        const id = `${font.name}-${font.style}-${font.size}-${font.typographyName || ''}-${Date.now()}`;
        fontLibrary.push({
          ...font,
          id,
          confirmedAt: Date.now()
        });
      }
      await saveFontLibrary();
      figma.notify(`已添加 ${fontsToAdd.length} 个字体到库`);
      break;
      
    case 'remove-font':
      // 从库中移除字体
      const fontId: string = msg.data;
      fontLibrary = fontLibrary.filter(f => f.id !== fontId);
      await saveFontLibrary();
      break;
      
    case 'clear-library':
      // 清空字体库
      fontLibrary = [];
      await saveFontLibrary();
      figma.notify('字体库已清空');
      break;
      
    case 'confirm-colors': {
      const colorsToAdd: ColorPreviewItem[] = msg.data;
      for (const c of colorsToAdd) {
        colorLibrary.push({
          id: `${c.styleId}-${Date.now()}`,
          styleId: c.styleId,
          name: c.name,
          confirmedAt: Date.now()
        });
      }
      await saveColorLibrary();
      figma.notify(`已添加 ${colorsToAdd.length} 个颜色到规范库`);
      break;
    }

    case 'remove-color': {
      const colorItemId: string = msg.data;
      colorLibrary = colorLibrary.filter(c => c.id !== colorItemId);
      await saveColorLibrary();
      break;
    }

    case 'clear-color-library':
      colorLibrary = [];
      await saveColorLibrary();
      figma.notify('颜色规范库已清空');
      break;

    case 'validate-fonts':
      // 执行字体校验（含 Typography + 颜色是否有名称）
      cachedTextStyles = null;
      cachedPaintStyles = null;
      figma.notify('正在扫描页面...');
      const validationResults = await scanPageForValidation();
      figma.ui.postMessage({
        type: 'validation-results',
        data: validationResults
      });
      break;

    case 'focus-node': {
      // 点击校验项：选中并滚动到该文本节点
      const targetNodeId: string = msg.data;
      const targetNode = await figma.getNodeByIdAsync(targetNodeId);
      if (targetNode && 'type' in targetNode) {
        figma.currentPage.selection = [targetNode as SceneNode];
        figma.viewport.scrollAndZoomIntoView([targetNode as SceneNode]);
        figma.notify('已定位到该文本节点');
      } else {
        figma.notify('节点不存在或已被删除');
      }
      break;
    }

    case 'close':
      figma.closePlugin();
      break;
  }
};

// 初始预览
processSelectionForPreview().catch(console.error);
