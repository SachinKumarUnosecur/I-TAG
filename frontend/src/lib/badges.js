import { cn } from './cn';
import { ui } from './ui';

const BADGE = {
  'badge-critical': ui.badgeCritical,
  'badge-medium': ui.badgeMedium,
  'badge-warning': ui.badgeWarning,
  'badge-success': ui.badgeSuccess,
  'badge-info': ui.badgeInfo,
  'badge-inactive': ui.badgeInactive,
  critical: ui.badgeCritical,
  medium: ui.badgeMedium,
  warning: ui.badgeWarning,
  success: ui.badgeSuccess,
  info: ui.badgeInfo,
  inactive: ui.badgeInactive,
};

const SEV = {
  'sev-critical': ui.sevCritical,
  'sev-high': ui.sevHigh,
  'sev-medium': ui.sevMedium,
  'sev-low': ui.sevLow,
  'sev-info': ui.sevInfo,
  critical: ui.sevCritical,
  high: ui.sevHigh,
  medium: ui.sevMedium,
  low: ui.sevLow,
  info: ui.sevInfo,
};

const HEAT = {
  l0: ui.heatL0,
  l1: ui.heatL1,
  l2: ui.heatL2,
  l3: ui.heatL3,
  l4: ui.heatL4,
};

export function badgeClass(key) {
  return cn(ui.badge, BADGE[key] || ui.badgeInfo);
}

export function sevClass(key) {
  return cn(ui.sev, SEV[key] || ui.sevInfo);
}

export function heatClass(lvl) {
  return cn(ui.heatCell, HEAT[lvl] || ui.heatL0);
}
