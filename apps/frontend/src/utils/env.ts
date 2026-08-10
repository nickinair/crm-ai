/**
 * 运行环境识别
 *
 * 判定优先级：
 * 1. 构建时注入的 VITE_APP_ENV（deploy.sh 部署测试环境时会设置为 test）
 * 2. 兜底：按访问域名/IP 识别，避免构建变量遗漏时测试环境不带标识
 *
 * 生产环境不满足任一条件，因此不会展示任何环境标识。
 */
const TEST_HOSTS = ['crm-test.easy-charge.cn', '152.136.51.90'];

const buildEnv = (import.meta.env.VITE_APP_ENV || '').toLowerCase();

const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

export const IS_TEST_ENV = buildEnv === 'test' || TEST_HOSTS.includes(hostname);

export const ENV_LABEL = IS_TEST_ENV ? '测试环境' : '';

export const ENV_LABEL_SHORT = IS_TEST_ENV ? '测试' : '';
