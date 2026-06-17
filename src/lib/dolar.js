import { supabase } from './supabase'

export const getDolar = async () => {
  // 1. Intentar desde Supabase (cache < 1 hora)
  try {
    const { data } = await supabase
      .from('usd_rates')
      .select('rate_blue, rate_oficial, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .single()

    if (data) {
      const age = Date.now() - new Date(data.recorded_at).getTime()
      if (age < 3_600_000) {
        return { blue: data.rate_blue, oficial: data.rate_oficial }
      }
    }
  } catch (_) { /* sin filas → fallback */ }

  // 2. Fallback: dolarapi.com
  const [blueRes, ofRes] = await Promise.all([
    fetch('https://dolarapi.com/v1/dolares/blue').then(r => r.json()),
    fetch('https://dolarapi.com/v1/dolares/oficial').then(r => r.json()),
  ])
  return { blue: blueRes.venta, oficial: ofRes.venta }
}
