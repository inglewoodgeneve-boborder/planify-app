import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── SITES ──────────────────────────────────────────────────
export async function getSites() {
  const { data, error } = await supabase.from('sites').select('*').order('name')
  if (error) throw error
  return data
}

// ─── EMPLOYEES ──────────────────────────────────────────────
export async function getEmployees(siteId) {
  const { data, error } = await supabase
    .from('employees').select('*').eq('site_id', siteId).eq('active', true).order('last_name')
  if (error) throw error
  return data
}

function generatePin() {
  return String(Math.floor(1000 + Math.random() * 9000))
}
function hashPin(pin) { return btoa('planify:' + pin) }

export async function createEmployee(data) {
  const pin = generatePin()
  const { data: emp, error } = await supabase
    .from('employees')
    .insert({ ...data, pin_hash: hashPin(pin) })
    .select()
    .single()
  if (error) throw error
  return { ...emp, _plainPin: pin }   // _plainPin ephemeral — never stored
}

export async function deleteEmployee(id) {
  const { error } = await supabase.from('employees').delete().eq('id', id)
  if (error) throw error
}

// ─── SHIFT DEFS ─────────────────────────────────────────────
export async function getShiftDefs(siteId) {
  const { data, error } = await supabase
    .from('shift_defs').select('*').eq('site_id', siteId).order('sort_order')
  if (error) throw error
  return data
}

export async function createShiftDef(data) {
  const { data: def, error } = await supabase.from('shift_defs').insert(data).select().single()
  if (error) throw error
  return def
}

export async function deleteShiftDef(id) {
  const { error } = await supabase.from('shift_defs').delete().eq('id', id)
  if (error) throw error
}

// ─── SHIFTS ─────────────────────────────────────────────────
export async function getShiftsForWeek(siteId, dateFrom, dateTo) {
  const { data, error } = await supabase
    .from('shifts')
    .select('*, employees(id, first_name, last_name, role, contract_pct), shift_defs(id, label, color)')
    .eq('site_id', siteId)
    .gte('work_date', dateFrom)
    .lte('work_date', dateTo)
  if (error) throw error
  return data
}

export async function upsertShift(shift) {
  const { data, error } = await supabase.from('shifts').insert(shift).select().single()
  if (error) throw error
  return data
}

export async function deleteShift(id) {
  const { error } = await supabase.from('shifts').delete().eq('id', id)
  if (error) throw error
}

export async function confirmShift(id) {
  const { data, error } = await supabase.from('shifts').update({ status: 'confirmed' }).eq('id', id).select().single()
  if (error) throw error
  return data
}

// ─── CLOCKINGS ──────────────────────────────────────────────
export async function getClockingsForDate(siteId, date) {
  const { data, error } = await supabase
    .from('clockings').select('*, employees(id, first_name, last_name, role)').eq('site_id', siteId).eq('work_date', date)
  if (error) throw error
  return data
}

export async function clockIn(employeeId, siteId, date) {
  const { data, error } = await supabase
    .from('clockings').insert({ employee_id: employeeId, site_id: siteId, work_date: date, clock_in: new Date().toISOString() }).select().single()
  if (error) throw error
  return data
}

export async function clockOut(clockingId, clockInIso) {
  const clock_out = new Date().toISOString()
  const duration_min = clockInIso
    ? Math.round((new Date(clock_out) - new Date(clockInIso)) / 60000)
    : null
  const { data, error } = await supabase
    .from('clockings').update({ clock_out, duration_min }).eq('id', clockingId).select().single()
  if (error) throw error
  return data
}

// ─── TEMPLATES ──────────────────────────────────────────────
export async function getTemplates(siteId) {
  const { data, error } = await supabase
    .from('week_templates').select('*, week_template_slots(*)').eq('site_id', siteId).order('created_at')
  if (error) throw error
  return data
}

export async function saveTemplate(siteId, name, slots) {
  const { data: tpl, error } = await supabase.from('week_templates').insert({ site_id: siteId, name }).select().single()
  if (error) throw error
  if (slots.length > 0) {
    const { error: slotError } = await supabase.from('week_template_slots').insert(slots.map(s => ({ ...s, template_id: tpl.id })))
    if (slotError) throw slotError
  }
  return tpl
}

export async function deleteTemplate(id) {
  const { error } = await supabase.from('week_templates').delete().eq('id', id)
  if (error) throw error
}

// ─── REALTIME ───────────────────────────────────────────────
export function subscribeToShifts(siteId, callback) {
  return supabase.channel(`shifts:${siteId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts', filter: `site_id=eq.${siteId}` }, callback)
    .subscribe()
}

export function subscribeToClockings(siteId, callback) {
  return supabase.channel(`clockings:${siteId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clockings', filter: `site_id=eq.${siteId}` }, callback)
    .subscribe()
}
