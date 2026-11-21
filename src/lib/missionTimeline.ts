import { MissionItem } from '../types';

export interface TimelineDaySlot {
  dateKey: string;
  dayShort: string;
  dayNum: number;
  monthShort: string;
  isToday: boolean;
  dueLabelValue: string;
}

export interface ResolvedMissionSchedule {
  bucketKey: string;
  bucketLabel: string;
  subLabel?: string;
  dateKey: string | null;
  sortOrder: number;
  isOverdue: boolean;
  isToday: boolean;
}

export interface TimelineBucket {
  bucketKey: string;
  bucketLabel: string;
  subLabel?: string;
  dateKey: string | null;
  sortOrder: number;
  isOverdue: boolean;
  isToday: boolean;
  items: MissionItem[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS_SHORT = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getUpcomingDaySlots(daysCount = 7, now = new Date()): TimelineDaySlot[] {
  const base = startOfLocalDay(now);
  const slots: TimelineDaySlot[] = [];

  for (let i = 0; i < daysCount; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const dateKey = toLocalDateKey(d);
    const dayShort = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const monthShort = d.toLocaleDateString('en-US', { month: 'short' });
    const dueLabelValue =
      i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `${monthShort} ${d.getDate()}`;

    slots.push({
      dateKey,
      dayShort,
      dayNum: d.getDate(),
      monthShort,
      isToday: i === 0,
      dueLabelValue,
    });
  }
  return slots;
}

function parseExplicitDate(raw: string, baseToday: Date): Date | null {
  const trimmed = raw.trim();

  // ISO YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const dt = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(dt.getTime())) return startOfLocalDay(dt);
  }

  // Numeric MM/DD or MM/DD/YYYY
  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const m = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    let y = slash[3] ? Number(slash[3]) : baseToday.getFullYear();
    if (y < 100) y += 2000;
    const dt = new Date(y, m, day);
    if (!Number.isNaN(dt.getTime()) && dt.getMonth() === m) return startOfLocalDay(dt);
  }

  // Month name + day, e.g. "Nov 24" or "November 24, 2026"
  const monthRegex = new RegExp(`^(${MONTHS_SHORT.join('|')})[a-z]*\\s+(\\d{1,2})(?:,?\\s*(\\d{4}))?$`, 'i');
  const mMatch = trimmed.match(monthRegex);
  if (mMatch) {
    const mIdx = MONTHS_SHORT.indexOf(mMatch[1].toLowerCase().slice(0, 3));
    const day = Number(mMatch[2]);
    const y = mMatch[3] ? Number(mMatch[3]) : baseToday.getFullYear();
    const dt = new Date(y, mIdx, day);
    if (!Number.isNaN(dt.getTime()) && dt.getMonth() === mIdx) return startOfLocalDay(dt);
  }

  return null;
}

function formatDayBucketHeader(d: Date, diffDays: number): { label: string; subLabel: string } {
  const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
  if (diffDays === 0) return { label: 'Today', subLabel: `${weekday}, ${shortDate}` };
  if (diffDays === 1) return { label: 'Tomorrow', subLabel: `${weekday}, ${shortDate}` };
  return { label: `${weekday}, ${shortDate}`, subLabel: `In ${diffDays} days` };
}

export function resolveMissionSchedule(mission: MissionItem, now = new Date()): ResolvedMissionSchedule {
  const today = startOfLocalDay(now);
  const raw = (mission.dueLabel || '').trim();
  const lower = raw.toLowerCase();

  if (lower === 'completed' || (mission.status === 'done' && !raw)) {
    return {
      bucketKey: 'completed',
      bucketLabel: 'Completed',
      subLabel: 'Archived objectives',
      dateKey: null,
      sortOrder: 9000,
      isOverdue: false,
      isToday: false,
    };
  }

  if (lower === 'overdue' || lower === 'yesterday') {
    return {
      bucketKey: 'overdue',
      bucketLabel: 'Overdue',
      subLabel: 'Requires immediate attention',
      dateKey: null,
      sortOrder: -100,
      isOverdue: mission.status === 'active',
      isToday: false,
    };
  }

  if (
    lower === 'today' ||
    lower === 'tonight' ||
    lower === 'asap' ||
    lower === 'now' ||
    lower === 'eod'
  ) {
    const hdr = formatDayBucketHeader(today, 0);
    return {
      bucketKey: toLocalDateKey(today),
      bucketLabel: hdr.label,
      subLabel: hdr.subLabel,
      dateKey: toLocalDateKey(today),
      sortOrder: 0,
      isOverdue: false,
      isToday: true,
    };
  }

  if (lower === 'tomorrow' || lower === 'tmrw') {
    const tmrw = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const hdr = formatDayBucketHeader(tmrw, 1);
    return {
      bucketKey: toLocalDateKey(tmrw),
      bucketLabel: hdr.label,
      subLabel: hdr.subLabel,
      dateKey: toLocalDateKey(tmrw),
      sortOrder: 1,
      isOverdue: false,
      isToday: false,
    };
  }

  if (lower === 'this week' || lower === 'weekend') {
    const targetOffset = lower === 'weekend' ? Math.max(1, 6 - today.getDay()) : 3;
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + targetOffset);
    return {
      bucketKey: 'this-week',
      bucketLabel: lower === 'weekend' ? 'This Weekend' : 'This Week',
      subLabel: dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      dateKey: toLocalDateKey(dt),
      sortOrder: targetOffset,
      isOverdue: false,
      isToday: false,
    };
  }

  if (lower === 'next week') {
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
    return {
      bucketKey: 'next-week',
      bucketLabel: 'Next Week',
      subLabel: `Week of ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      dateKey: toLocalDateKey(dt),
      sortOrder: 7,
      isOverdue: false,
      isToday: false,
    };
  }

  // Weekday names e.g. "Monday", "next Fri"
  const weekdayClean = lower.replace(/^next\s+/, '');
  const wdIdx =
    WEEKDAYS.indexOf(weekdayClean) !== -1
      ? WEEKDAYS.indexOf(weekdayClean)
      : WEEKDAYS_SHORT.indexOf(weekdayClean);
  if (wdIdx !== -1) {
    let delta = (wdIdx - today.getDay() + 7) % 7;
    if (lower.startsWith('next ') && delta === 0) delta = 7;
    if (lower.startsWith('next ') && delta < 7) delta += 7;
    const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta);
    const hdr = formatDayBucketHeader(dt, delta);
    return {
      bucketKey: toLocalDateKey(dt),
      bucketLabel: hdr.label,
      subLabel: hdr.subLabel,
      dateKey: toLocalDateKey(dt),
      sortOrder: delta,
      isOverdue: false,
      isToday: delta === 0,
    };
  }

  // Explicit date parsing
  const parsedDate = parseExplicitDate(raw, today);
  if (parsedDate) {
    const diffDays = Math.round((parsedDate.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0 && mission.status === 'active') {
      return {
        bucketKey: 'overdue',
        bucketLabel: 'Overdue',
        subLabel: `${Math.abs(diffDays)}d past target`,
        dateKey: toLocalDateKey(parsedDate),
        sortOrder: diffDays,
        isOverdue: true,
        isToday: false,
      };
    }
    if (diffDays < 0 && mission.status === 'done') {
      return {
        bucketKey: 'completed',
        bucketLabel: 'Completed',
        subLabel: 'Archived objectives',
        dateKey: toLocalDateKey(parsedDate),
        sortOrder: 9000,
        isOverdue: false,
        isToday: false,
      };
    }
    const hdr = formatDayBucketHeader(parsedDate, diffDays);
    return {
      bucketKey: toLocalDateKey(parsedDate),
      bucketLabel: hdr.label,
      subLabel: hdr.subLabel,
      dateKey: toLocalDateKey(parsedDate),
      sortOrder: diffDays,
      isOverdue: false,
      isToday: diffDays === 0,
    };
  }

  if (!raw || lower === 'later' || lower === 'backlog' || lower === 'someday') {
    return {
      bucketKey: 'unscheduled',
      bucketLabel: 'Backlog & Unscheduled',
      subLabel: 'No target date',
      dateKey: null,
      sortOrder: 5000,
      isOverdue: false,
      isToday: false,
    };
  }

  return {
    bucketKey: `custom:${lower}`,
    bucketLabel: raw,
    subLabel: 'Custom milestone',
    dateKey: null,
    sortOrder: 4000,
    isOverdue: false,
    isToday: false,
  };
}

export function buildMissionTimelineBuckets(
  missions: MissionItem[],
  now = new Date(),
): TimelineBucket[] {
  const map = new Map<string, TimelineBucket>();
  const priorityRank: Record<MissionItem['priority'], number> = { P1: 0, P2: 1, P3: 2 };

  for (const m of missions) {
    const sched = resolveMissionSchedule(m, now);
    const existing = map.get(sched.bucketKey);
    if (existing) {
      existing.items.push(m);
    } else {
      map.set(sched.bucketKey, {
        bucketKey: sched.bucketKey,
        bucketLabel: sched.bucketLabel,
        subLabel: sched.subLabel,
        dateKey: sched.dateKey,
        sortOrder: sched.sortOrder,
        isOverdue: sched.isOverdue,
        isToday: sched.isToday,
        items: [m],
      });
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((bucket) => ({
      ...bucket,
      items: [...bucket.items].sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        return priorityRank[a.priority] - priorityRank[b.priority];
      }),
    }));
}
