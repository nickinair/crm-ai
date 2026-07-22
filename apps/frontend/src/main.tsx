import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import updateLocale from 'dayjs/plugin/updateLocale'

dayjs.extend(updateLocale)
dayjs.locale('zh-cn')
dayjs.updateLocale('zh-cn', {
  weekdaysMin: ['日', '一', '二', '三', '四', '五', '六'],
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider, Spin } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import LightningLoading from './components/LightningLoading'
import './index.css'

Spin.setDefaultIndicator(<LightningLoading />)

import { library } from '@fortawesome/fontawesome-svg-core'
import { fas } from '@fortawesome/free-solid-svg-icons'
library.add(fas)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider 
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          wireframe: false,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </StrictMode>,
)
