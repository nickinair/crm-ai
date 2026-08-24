/**
 * 全局为 antd Select 注入默认「可搜索」能力（组件规范 8.2 第 3 条）
 *
 * 137 个下拉逐个加 showSearch 维护成本高且易遗漏，改为在应用入口一次性
 * 包装 Select 的 defaultProps：
 * - showSearch：支持输入过滤
 * - filterOption：按选项文本做不区分大小写的包含匹配（options 与 children 两种写法都覆盖）
 * 单个下拉如需关闭，显式传 showSearch={false} 即可覆盖。
 */
import { Select } from 'antd';

const defaultFilterOption = (input: string, option: any): boolean => {
  if (!input) return true;
  const kw = String(input).toLowerCase();
  const text =
    option?.label ??
    option?.title ??
    (typeof option?.children === 'string' ? option.children : '') ??
    option?.value ??
    '';
  return String(text).toLowerCase().includes(kw);
};

export function applySelectDefaults() {
  const S = Select as any;
  const prev = S.defaultProps || {};
  S.defaultProps = {
    ...prev,
    showSearch: prev.showSearch ?? true,
    optionFilterProp: prev.optionFilterProp ?? 'label',
    filterOption: prev.filterOption ?? defaultFilterOption,
  };
}
