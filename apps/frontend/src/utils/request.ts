import axios from 'axios';
import { message } from 'antd';

const instance = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

let isRedirecting = false;

instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

instance.interceptors.response.use(
  (response) => {
    return response.data; // nestjs 默认可能直接返回 data
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      if (!isRedirecting) {
        isRedirecting = true;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        message.warning('登录已过期，请重新登录');
        setTimeout(() => {
          window.location.href = '/login';
        }, 500);
      }
    } else if (!axios.isCancel(error) && error.message !== 'Network Error') {
      // 后台轮询类接口（导入任务发现/进度）静默失败，不弹全局错误提示
      const url = error.config?.url || '';
      const isSilentPoll = url.includes('/lead/import-active') || url.includes('/lead/import-progress/');
      if (!isSilentPoll) {
        message.error(error.response?.data?.message || '请求失败');
      }
    }
    return Promise.reject(error);
  }
);

export default instance;
