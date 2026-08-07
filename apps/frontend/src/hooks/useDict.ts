import { useState, useEffect, useCallback } from 'react';
import request from '../utils/request';

interface DictItem {
  id: string;
  dictTypeId: string;
  /** 父级字典项值，用于联动字典（如商品属性按商品类型分组），无联动时为 null */
  parentValue: string | null;
  itemCode: string;
  itemLabel: string;
  itemValue: string;
  sortOrder: number;
  status: number;
}

// Module-level cache: loaded once, shared across all component instances
let dictCache: Record<string, DictItem[]> | null = null;
let dictPromise: Promise<Record<string, DictItem[]>> | null = null;

function loadDict(): Promise<Record<string, DictItem[]>> {
  if (dictCache) return Promise.resolve(dictCache);
  if (dictPromise) return dictPromise;

  dictPromise = request.get('/dict/all').then((res: any) => {
    dictCache = res as Record<string, DictItem[]>;
    return dictCache;
  }).catch((err) => {
    dictPromise = null; // allow retry on failure
    throw err;
  });

  return dictPromise;
}

/**
 * Hook to access data dictionary items.
 * - Loads all dict data once on first mount, caches in memory.
 * - Returns `getDictOptions(typeCode)` to get `{ label, value }[]` for Ant Design Select.
 * - Returns `getDictItems(typeCode)` to get raw DictItem[].
 */
export function useDict() {
  const [allDict, setAllDict] = useState<Record<string, DictItem[]>>(dictCache || {});
  const [dictLoading, setDictLoading] = useState(!dictCache);

  useEffect(() => {
    if (dictCache) {
      setAllDict(dictCache);
      setDictLoading(false);
      return;
    }

    setDictLoading(true);
    loadDict().then((data) => {
      setAllDict(data);
      setDictLoading(false);
    }).catch(() => {
      setDictLoading(false);
    });
  }, []);

  const getDictItems = useCallback((typeCode: string): DictItem[] => {
    return allDict[typeCode] || [];
  }, [allDict]);

  const getDictOptions = useCallback((typeCode: string): { label: string; value: string }[] => {
    return (allDict[typeCode] || []).map(item => ({
      label: item.itemLabel,
      value: item.itemValue,
    }));
  }, [allDict]);

  /**
   * 联动字典取值：按父级值过滤（如商品属性随商品类型变化）
   * parentValue 为空时返回空数组——未选父级前下拉应无可选项
   */
  const getDictOptionsByParent = useCallback((typeCode: string, parentValue?: string | null): { label: string; value: string }[] => {
    if (!parentValue) return [];
    return (allDict[typeCode] || [])
      .filter(item => item.parentValue === parentValue)
      .map(item => ({ label: item.itemLabel, value: item.itemValue }));
  }, [allDict]);

  return { allDict, dictLoading, getDictItems, getDictOptions, getDictOptionsByParent };
}
