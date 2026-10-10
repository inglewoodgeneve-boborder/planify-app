// ============================================================
// RÈGLES L-GAV / CCNT Hôtellerie-Restauration Suisse
// ============================================================

export const LGAV = {
  maxHoursPerDay:        9,
  maxHoursPerWeek:       45,
  minRestBetweenShifts:  11,   // heures
  minWeeklyRest:         35,   // heures consécutives
  breakIfOver:           5.5,  // heures → pause 30min obligatoire
  maxConsecutiveDays:    6,
  nightStart:            23,
  nightEnd:              6,
  nightBonus:            0.25,
  sundayBonus:           0.25,
  holidayBonus:          0.50,
  overtimeThreshold:     45,
  overtimeBonus:         0.25,
}

const SWISS_HOLIDAYS = [
  '2026-01-01','2026-01-02','2026-04-03','2026-04-06',
  '2026-05-01','2026-05-14','2026-05-25','2026-08-01',
  '2026-12-25','2026-12-26',
  '2027-01-01','2027-04-02','2027-04-05',
  '2027-05-01','2027-05-13','2027-05-24','2027-08-02',
  '2027-12-24','2027-12-25','2027-12-26',
]

export function isHoliday(dateStr) {
  return SWISS_HOLIDAYS.includes(dateStr)
}

export function isSunday(dateStr) {
  return new Date(dateStr).getDay() === 0
}

export function shiftDuration(startTime, endTime) {
  if (!startTime || !endTime) return 0
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  let h = (eh + em / 60) - (sh + sm / 60)
  if (h <= 0) h += 24
  return h
}

export function hasNightHours(startTime, endTime) {
  if (!startTime || !endTime) return false
  const [sh] = startTime.split(':').map(Number)
  const [eh] = endTime.split(':').map(Number)
  return sh >= LGAV.nightStart || eh <= LGAV.nightEnd
}

// Retourne la liste des violations/alertes pour un shift donné
export function checkShift({ startTime, endTime, workDate }) {
  const violations = []
  if (!startTime || !endTime) return violations

  const dur = shiftDuration(startTime, endTime)

  if (dur > LGAV.maxHoursPerDay) {
    violations.push({
      type: 'error',
      code: 'MAX_DAY',
      msg:  `Journée > ${LGAV.maxHoursPerDay}h (${dur.toFixed(1)}h travaillées)`,
    })
  }
  if (dur > LGAV.breakIfOver) {
    violations.push({
      type: 'info',
      code: 'BREAK_REQUIRED',
      msg:  'Pause repas 30 min obligatoire à intégrer dans le shift',
    })
  }
  if (isSunday(workDate)) {
    violations.push({
      type: 'warning',
      code: 'SUNDAY',
      msg:  'Dimanche — supplément +25% (art. L-GAV)',
    })
  }
  if (isHoliday(workDate)) {
    violations.push({
      type: 'warning',
      code: 'HOLIDAY',
      msg:  'Jour férié — supplément +50% (art. L-GAV)',
    })
  }
  if (hasNightHours(startTime, endTime)) {
    violations.push({
      type: 'warning',
      code: 'NIGHT',
      msg:  'Heures de nuit (23h–6h) — supplément +25%',
    })
  }
  return violations
}

// Calcule les heures hebdomadaires d'un employé
export function weeklyHours(shiftsArray) {
  return shiftsArray.reduce((acc, s) => acc + shiftDuration(s.start_time, s.end_time), 0)
}

// Vérifie les règles sur toute la semaine pour un employé
export function checkWeek(shiftsArray) {
  const violations = []
  const total = weeklyHours(shiftsArray)

  if (total > LGAV.maxHoursPerWeek) {
    violations.push({
      type: 'error',
      code: 'MAX_WEEK',
      msg:  `Semaine > ${LGAV.maxHoursPerWeek}h (${total.toFixed(1)}h planifiées)`,
    })
  }

  const workDays = shiftsArray.filter(s => s.start_time && s.end_time)
  if (workDays.length > LGAV.maxConsecutiveDays) {
    violations.push({
      type: 'error',
      code: 'CONSECUTIVE_DAYS',
      msg:  `Plus de ${LGAV.maxConsecutiveDays} jours consécutifs`,
    })
  }

  return violations
}

// Calcule le coût d'un shift (salaire horaire × majorations)
export function shiftCost(startTime, endTime, workDate, hourlyRate = 25) {
  const base = shiftDuration(startTime, endTime)
  const overtime = Math.max(0, base - LGAV.overtimeThreshold)
  let cost = base * hourlyRate

  if (isSunday(workDate))  cost *= (1 + LGAV.sundayBonus)
  if (isHoliday(workDate)) cost *= (1 + LGAV.holidayBonus)
  if (hasNightHours(startTime, endTime)) cost *= (1 + LGAV.nightBonus)
  if (overtime > 0) cost += overtime * hourlyRate * LGAV.overtimeBonus

  return { base, overtime, cost: Math.round(cost * 100) / 100 }
}
