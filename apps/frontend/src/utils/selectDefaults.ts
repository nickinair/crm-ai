/**
 * 全局「下拉可搜索」配置（组件规范 8.2 第 3 条）
 *
 * 137 个下拉逐个加 showSearch 维护成本高且易遗漏，改为在应用入口通过
 * ConfigProvider 的组件级配置 select={{ showSearch: SELECT_SEARCH }} 统一注入。
 *
 * 注意：早期版本用 Select.defaultProps 注入，React 19 已移除函数组件的
 * defaultProps 支持，那种写法静默失效，故改为 ConfigProvider 方案。
 *
 * - showSearch 传对象时，rc-select 会把对象里的 filterOption / optionFilterProp
 *   一并作为搜索配置，等价于「可搜索 + 按选项文本不区分大小写包含匹配」
 * - 单个下拉如需关闭搜索，显式传 showSearch={false}
 * - 服务端搜索的下拉显式传 showSearch + filterOption={false}，不受本配置影响
 */
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

export const SELECT_SEARCH = {
  optionFilterProp: 'label',
  filterOption: defaultFilterOption,
};
