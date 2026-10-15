import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { employee_id } = await req.json()
    if (!employee_id) {
      return new Response(JSON.stringify({ error: 'employee_id requis' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    // Utilise le secret custom SERVICE_ROLE_KEY (ajouté manuellement dans Edge Functions > Secrets)
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Vérifier que l'appelant est authentifié
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non autorisé' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Récupérer l'employé
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, email, first_name, last_name')
      .eq('id', employee_id)
      .single()

    if (empError || !employee) {
      return new Response(JSON.stringify({ error: 'Employé introuvable' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!employee.email) {
      return new Response(JSON.stringify({ error: "Cet employé n'a pas d'adresse email" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Envoyer l'invitation
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      employee.email,
      {
        redirectTo: 'https://bob-planify.netlify.app/employee',
        data: { employee_id: employee.id, role: 'employee' }
      }
    )

    if (inviteError) {
      return new Response(JSON.stringify({ error: inviteError.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Mettre à jour invitation_sent_at et auth_user_id
    await supabaseAdmin
      .from('employees')
      .update({
        invitation_sent_at: new Date().toISOString(),
        auth_user_id: inviteData.user?.id ?? null,
      })
      .eq('id', employee_id)

    return new Response(
      JSON.stringify({ success: true, email: employee.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
