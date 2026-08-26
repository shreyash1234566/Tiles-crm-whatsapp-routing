import { addMinutes, isWeekend, getHours, setHours, setMinutes, setSeconds, isBefore, isAfter, startOfDay } from 'date-fns';

type SLAConfig = {
  firstResponseMins: number;
  resolutionMins: number;
  businessHoursOnly: boolean;
  timezone: string;
};

// Assuming business hours 9 AM to 5 PM
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;

export function calculateSLADueDates(
  config: SLAConfig,
  createdAt: Date = new Date()
): { firstResponseDue: Date; resolutionDue: Date } {
  // If no business hours constraint, simply add the minutes
  if (!config.businessHoursOnly) {
    return {
      firstResponseDue: addMinutes(createdAt, config.firstResponseMins),
      resolutionDue: addMinutes(createdAt, config.resolutionMins)
    };
  }

  // To support basic business hours calculation:
  // (In a real scenario, timezone consideration requires date-fns-tz)
  const firstResponseDue = addBusinessMinutes(createdAt, config.firstResponseMins);
  const resolutionDue = addBusinessMinutes(createdAt, config.resolutionMins);

  return { firstResponseDue, resolutionDue };
}

function addBusinessMinutes(date: Date, minutesToAdd: number): Date {
  let current = new Date(date);
  let remainingMinutes = minutesToAdd;

  while (remainingMinutes > 0) {
    // If weekend, jump to next Monday 9 AM
    if (isWeekend(current)) {
      current = advanceToNextBusinessDay(current);
      continue;
    }

    const hour = getHours(current);

    // If before business hours, jump to 9 AM
    if (hour < BUSINESS_START_HOUR) {
      current = setBusinessStart(current);
    }
    // If after or at end, jump to next day 9 AM
    else if (hour >= BUSINESS_END_HOUR) {
      current = advanceToNextBusinessDay(current);
    }
    // During business hours
    else {
      // Calculate minutes left in current day
      const endOfDay = setBusinessEnd(current);
      const msLeft = endOfDay.getTime() - current.getTime();
      const minsLeft = Math.floor(msLeft / 60000);

      if (remainingMinutes <= minsLeft) {
        current = addMinutes(current, remainingMinutes);
        remainingMinutes = 0;
      } else {
        remainingMinutes -= minsLeft;
        current = advanceToNextBusinessDay(current);
      }
    }
  }

  return current;
}

function advanceToNextBusinessDay(date: Date): Date {
  let next = new Date(date);
  next.setDate(next.getDate() + 1);
  while (isWeekend(next)) {
    next.setDate(next.getDate() + 1);
  }
  return setBusinessStart(next);
}

function setBusinessStart(date: Date): Date {
  return setSeconds(setMinutes(setHours(date, BUSINESS_START_HOUR), 0), 0);
}

function setBusinessEnd(date: Date): Date {
  return setSeconds(setMinutes(setHours(date, BUSINESS_END_HOUR), 0), 0);
}
