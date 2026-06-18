import type { GlobalThemeOverrides } from 'naive-ui'

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#2DBE8D',
    primaryColorHover: '#25A97B',
    primaryColorPressed: '#1E8E67',
    primaryColorSuppl: '#2F80ED',
    infoColor: '#38BDF8',
    successColor: '#10B981',
    warningColor: '#F59E0B',
    errorColor: '#EF4444',
    textColorBase: '#172033',
    textColor1: '#172033',
    textColor2: '#667085',
    textColor3: '#9CA3AF',
    borderColor: '#E6EDF5',
    borderRadius: '16px',
    fontSize: '14px',
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  Card: {
    borderRadius: '16px',
    paddingMedium: '24px',
    titleFontSizeMedium: '18px',
  },
  Button: {
    borderRadiusMedium: '12px',
    fontSizeMedium: '15px',
    heightMedium: '40px',
    paddingMedium: '0 24px',
    textColorPrimary: '#FFFFFF',
  },
  Input: {
    borderRadius: '12px',
    heightMedium: '44px',
    fontSizeMedium: '15px',
    paddingMedium: '0 16px',
  },
  Tag: {
    borderRadius: '8px',
  },
  Table: {
    borderRadius: '12px',
  },
  Modal: {
    borderRadius: '20px',
  },
  Progress: {
    fillColor: '#2DBE8D',
    railColor: '#E6EDF5',
    borderRadius: '8px',
    height: '8px',
  },
  Switch: {
    railColorActive: '#2DBE8D',
  },
  Menu: {
    itemTextColor: '#667085',
    itemTextColorHover: '#2DBE8D',
    itemTextColorActive: '#2DBE8D',
    itemIconColor: '#667085',
    itemIconColorHover: '#2DBE8D',
    itemIconColorActive: '#2DBE8D',
  },
}
