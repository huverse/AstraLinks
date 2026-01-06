/**
 * 统一的日期格式化工具
 * 解决8小时时差问题 - 确保显示用户选择的时区时间而非浏览器时区
 */

export type DateFormatStyle = 'full' | 'date' | 'time' | 'short' | 'relative';

interface FormatDateOptions {
  style?: DateFormatStyle;
  timezone?: string;
  locale?: string;
}

/**
 * 格式化日期时间
 * @param dateStr - ISO 日期字符串 (UTC)
 * @param options - 格式化选项
 * @returns 格式化后的日期字符串
 */
export function formatDate(
  dateStr: string | Date | null | undefined,
  options: FormatDateOptions = {}
): string {
  if (!dateStr) return '';

  const { style = 'full', timezone = 'Asia/Shanghai', locale = 'zh-CN' } = options;
  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;

  if (isNaN(date.getTime())) return '';

  switch (style) {
    case 'full':
      return date.toLocaleString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

    case 'date':
      return date.toLocaleString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: timezone,
      });

    case 'time':
      return date.toLocaleString(locale, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

    case 'short':
      return date.toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: timezone,
      });

    case 'relative':
      return getRelativeTime(date, timezone);

    default:
      return date.toLocaleString(locale, { timeZone: timezone });
  }
}

/**
 * 获取相对时间 (如 "3天后", "2小时前")
 */
function getRelativeTime(date: Date, timezone: string): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 365) {
    const years = Math.floor(diffDays / 365);
    return `${years}年后`;
  } else if (diffDays > 30) {
    const months = Math.floor(diffDays / 30);
    return `${months}个月后`;
  } else if (diffDays > 0) {
    return `${diffDays}天后`;
  } else if (diffDays === 0 && diffHours > 0) {
    return `${diffHours}小时后`;
  } else if (diffDays === 0 && diffMinutes > 0) {
    return `${diffMinutes}分钟后`;
  } else if (diffDays === 0 && diffMinutes === 0) {
    return '现在';
  } else if (diffDays > -1) {
    return `${Math.abs(diffHours)}小时前`;
  } else if (diffDays > -30) {
    return `${Math.abs(diffDays)}天前`;
  } else if (diffDays > -365) {
    return `${Math.floor(Math.abs(diffDays) / 30)}个月前`;
  } else {
    return `${Math.floor(Math.abs(diffDays) / 365)}年前`;
  }
}

/**
 * 格式化剩余时间 (用于信件送达倒计时)
 */
export function formatTimeRemaining(targetDate: string | Date): string {
  const target = typeof targetDate === 'string' ? new Date(targetDate) : targetDate;
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return '已送达';

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 365) {
    const years = Math.floor(days / 365);
    const remainingDays = days % 365;
    return remainingDays > 0 ? `${years}年${remainingDays}天` : `${years}年`;
  } else if (days > 30) {
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    return remainingDays > 0 ? `${months}个月${remainingDays}天` : `${months}个月`;
  } else if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时` : `${days}天`;
  } else if (hours > 0) {
    return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
  } else {
    return `${minutes}分钟`;
  }
}

/**
 * 遮蔽邮箱地址 (如 t***@example.com)
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 2) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart[0]}***${localPart[localPart.length - 1]}@${domain}`;
}
