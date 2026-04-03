import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

type Ctx = {
  openNodeConfig: () => void;
  closeNodeConfig: () => void;
  configModalVisible: boolean;
};

const RuleGoNodeConfigModalContext = createContext<Ctx | null>(null);

export function RuleGoNodeConfigModalProvider({ children }: { children: React.ReactNode }) {
  const [configModalVisible, setConfigModalVisible] = useState(false);

  const openNodeConfig = useCallback(() => setConfigModalVisible(true), []);
  const closeNodeConfig = useCallback(() => setConfigModalVisible(false), []);

  const value = useMemo(
    () => ({ openNodeConfig, closeNodeConfig, configModalVisible }),
    [openNodeConfig, closeNodeConfig, configModalVisible]
  );

  return <RuleGoNodeConfigModalContext.Provider value={value}>{children}</RuleGoNodeConfigModalContext.Provider>;
}

export function useRuleGoNodeConfigModal(): Ctx {
  const v = useContext(RuleGoNodeConfigModalContext);
  if (!v) {
    throw new Error('useRuleGoNodeConfigModal must be used within RuleGoNodeConfigModalProvider');
  }
  return v;
}

export function useRuleGoNodeConfigModalOptional(): Ctx | null {
  return useContext(RuleGoNodeConfigModalContext);
}
