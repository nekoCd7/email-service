const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;  // Service role key for admin operations
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;  // Anon key for auth

let supabase;
let supabaseAuth;

class Database {
  constructor() {
    this.initialized = false;
  }

  async init() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY environment variables are required');
    }

    // Use service role key for admin operations
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    
    // Use anon key for auth if available
    if (SUPABASE_ANON_KEY) {
      supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      supabaseAuth = supabase;
    }
    
    this.initialized = true;
    console.log('Connected to Supabase');
  }

  // Auth methods using Supabase Auth
  async signup(email, password) {
    try {
      const client = supabaseAuth || supabase;
      
      // Try admin.createUser first (requires service role)
      if (supabase && supabase.auth.admin) {
        const { data, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });
        
        if (!error) {
          return data;
        }
      }
      
      // Fallback to standard signup
      const { data, error } = await client.auth.signUp({
        email,
        password
      });
      
      if (error) throw error;
      return data;
    } catch (err) {
      throw err;
    }
  }

  async login(email, password) {
    const client = supabaseAuth || supabase;
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) throw error;
    return data;
  }

  async logout(accessToken) {
    const client = supabaseAuth || supabase;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async getCurrentUser(accessToken) {
    const client = supabaseAuth || supabase;
    const { data: { user }, error } = await client.auth.getUser(accessToken);
    if (error) throw error;
    return user;
  }

  // Domain methods
  async createDomain(userId, domain) {
    const { data, error } = await supabase
      .from('domains')
      .insert([{ user_id: userId, domain, verified: false }]);
    
    if (error) throw error;
    return data;
  }

  async getDomains(userId) {
    const { data, error } = await supabase
      .from('domains')
      .select('*')
      .eq('user_id', userId);
    
    if (error) throw error;
    return data || [];
  }

  async updateDomainVerification(domainId, verified) {
    const { data, error } = await supabase
      .from('domains')
      .update({ verified })
      .eq('id', domainId);
    
    if (error) throw error;
    return data;
  }

  // Email methods
  async saveEmail(id, userId, from, to, subject, body, htmlBody, direction) {
    const { data, error } = await supabase
      .from('emails')
      .insert([{
        id,
        user_id: userId,
        from_address: from,
        to_address: to,
        subject,
        body,
        html_body: htmlBody,
        direction
      }]);
    
    if (error) throw error;
    return data;
  }

  async getEmails(userId, limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) throw error;
    return data || [];
  }

  async getEmail(emailId) {
    const { data, error } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  async markAsRead(emailId) {
    const { data, error } = await supabase
      .from('emails')
      .update({ is_read: true })
      .eq('id', emailId);
    
    if (error) throw error;
    return data;
  }

  async deleteEmail(emailId) {
    const { data, error } = await supabase
      .from('emails')
      .delete()
      .eq('id', emailId);
    
    if (error) throw error;
    return data;
  }

  async getEmailStats(userId) {
    const { data: allEmails, error: emailError } = await supabase
      .from('emails')
      .select('is_read')
      .eq('user_id', userId);
    
    if (emailError) throw emailError;

    const total = allEmails?.length || 0;
    const unread = allEmails?.filter(e => !e.is_read).length || 0;

    return { total, unread };
  }

  // Draft methods
  async saveDraft(id, userId, to, subject, body) {
    const { data, error } = await supabase
      .from('drafts')
      .insert([{
        id,
        user_id: userId,
        to_address: to,
        subject,
        body
      }]);
    
    if (error) throw error;
    return data;
  }

  async getDrafts(userId) {
    const { data, error } = await supabase
      .from('drafts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }

  async deleteDraft(draftId) {
    const { data, error } = await supabase
      .from('drafts')
      .delete()
      .eq('id', draftId);
    
    if (error) throw error;
    return data;
  }

  async close() {
    return Promise.resolve();
  }
}

module.exports = new Database();
