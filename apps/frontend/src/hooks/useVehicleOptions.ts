import { useState, useEffect } from 'react';
import request from '../utils/request';

export interface VehicleOptions {
  brands: string[];
  models: string[];
  styles: string[];
}

// 模块级缓存：品牌/车型/款式候选项加载一次，所有车辆弹窗共享
let cache: VehicleOptions | null = null;
let inflight: Promise<VehicleOptions> | null = null;

function load(): Promise<VehicleOptions> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = request.get('/customer/vehicle-options').then((res: any) => {
    cache = {
      brands: res?.brands || [],
      models: res?.models || [],
      styles: res?.styles || [],
    };
    return cache;
  }).catch((err) => {
    inflight = null;
    throw err;
  });
  return inflight;
}

// 供弹窗保存后调用，让下次打开能带上刚录入的新值
export function invalidateVehicleOptions() {
  cache = null;
  inflight = null;
}

/**
 * 车辆品牌/车型/款式候选项，用于 AutoComplete 下拉。
 * 返回 { brands, models, styles } 的 { value, label } 数组，直接喂给 AutoComplete。
 */
export function useVehicleOptions() {
  const [opts, setOpts] = useState<VehicleOptions>(cache || { brands: [], models: [], styles: [] });

  useEffect(() => {
    let mounted = true;
    load().then(data => { if (mounted) setOpts(data); }).catch(() => {});
    return () => { mounted = false; };
  }, []);

  const toAC = (arr: string[]) => arr.map(v => ({ value: v }));
  return {
    brandOptions: toAC(opts.brands),
    modelOptions: toAC(opts.models),
    styleOptions: toAC(opts.styles),
  };
}
