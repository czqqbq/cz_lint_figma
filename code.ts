// Figma 字体库提取插件
// 读取选中节点中的所有文本，提取字体信息

figma.showUI(__html__, { width: 400, height: 500 });

// 字体信息接口
interface FontInfo {
  name: string;
  fontWeight: number;
  style: string;
  size: number;
}

// 递归遍历节点，提取所有文本节点的字体信息
function extractFontsFromNode(node: SceneNode): FontInfo[] {
  const fonts: FontInfo[] = [];
  
  // 如果是文本节点
  if (node.type === 'TEXT') {
    const fontName = node.fontName;
    const fontSize = node.fontSize;
    
    // fontName 可能是 Symbol (mixed) 或 FontName 对象
    if (typeof fontName === 'object' && fontName !== null) {
      fonts.push({
        name: fontName.family,
        fontWeight: fontName.style === 'Bold' ? 700 : fontName.style === 'Medium' ? 500 : fontName.style === 'Light' ? 300 : 400,
        style: fontName.style,
        size: typeof fontSize === 'number' ? fontSize : 0
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
    const key = `${font.name}-${font.style}-${font.size}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

// 处理选中节点
function processSelection() {
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
  
  figma.ui.postMessage({
    type: 'fonts',
    data: uniqueFonts
  });
}

// 监听选择变化
figma.on('selectionchange', () => {
  processSelection();
});

// 初始处理
processSelection();

// 监听 UI 消息
figma.ui.onmessage = (msg) => {
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};
