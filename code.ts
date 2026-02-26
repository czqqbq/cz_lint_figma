// Figma 字体库提取插件
// 读取选中节点中的所有文本，提取字体信息，用户确认后保存到字体库

// 字体库存储（使用 clientStorage 持久化存储）
let fontLibrary: FontLibraryItem[] = [];

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

// 初始化：加载已保存的字体库
async function initFontLibrary() {
  const saved = await figma.clientStorage.getAsync('fontLibrary');
  if (saved) {
    fontLibrary = saved;
  }
  // 发送当前字体库给 UI
  figma.ui.postMessage({
    type: 'library-update',
    data: fontLibrary
  });
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
initFontLibrary();

// 获取 Typography 样式名称
function getTypographyName(node: TextNode): string | undefined {
  // 获取节点的文本样式 ID
  const textStyleId = node.textStyleId;
  if (textStyleId && typeof textStyleId === 'string') {
    // 查找本地文本样式
    const textStyles = figma.getLocalTextStyles();
    const style = textStyles.find(s => s.id === textStyleId);
    if (style) {
      return style.name;
    }
  }
  return undefined;
}

// 递归遍历节点，提取所有文本节点的字体信息
function extractFontsFromNode(node: SceneNode): FontInfo[] {
  const fonts: FontInfo[] = [];
  
  // 如果是文本节点
  if (node.type === 'TEXT') {
    const fontName = node.fontName;
    const fontSize = node.fontSize;
    const typographyName = getTypographyName(node);
    
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
      fonts.push(...extractFontsFromNode(child as SceneNode));
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
function processSelectionForPreview() {
  const selection = figma.currentPage.selection;
  
  if (selection.length === 0) {
    figma.ui.postMessage({ type: 'no-selection' });
    return;
  }
  
  let allFonts: FontInfo[] = [];
  
  // 遍历所有选中的节点
  for (const node of selection) {
    allFonts.push(...extractFontsFromNode(node));
  }
  
  // 去重
  const uniqueFonts = deduplicateFonts(allFonts);
  
  // 发送预览数据（未确认状态）
  figma.ui.postMessage({
    type: 'preview-fonts',
    data: uniqueFonts
  });
}

// 监听选择变化 - 自动预览
figma.on('selectionchange', () => {
  processSelectionForPreview();
});

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
      
    case 'close':
      figma.closePlugin();
      break;
  }
};

// 初始预览
processSelectionForPreview();
