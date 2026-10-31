import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ enabled: false, admin: true, query: vi.fn(() => ({ data: [], isPending: false, isError: false })) }));
vi.mock('@/lib/unifiedCrm', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/unifiedCrm')>(), get UNIFIED_CRM_ENABLED() { return state.enabled; } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ isAdmin: state.admin }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: state.query }));
// This UI fixture must never initialize the real Supabase client or auth storage.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get() { throw new Error('Real backend disabled in CRM UI tests'); } }),
}));
import { UnifiedCrmPanel } from '@/components/admin/UnifiedCrmPanel';
afterEach(() => { cleanup(); state.query.mockClear(); state.enabled = false; state.admin = true; });
describe('CRM access and feature gate', () => {
  it('never mounts its query when OFF', () => { render(<UnifiedCrmPanel />); expect(state.query).not.toHaveBeenCalled(); });
  it('never mounts its query for non-admin even when ON', () => { state.enabled = true; state.admin = false; render(<UnifiedCrmPanel />); expect(state.query).not.toHaveBeenCalled(); });
  it('mounts the read-only query only for opted-in admin', () => { state.enabled = true; render(<UnifiedCrmPanel />); expect(state.query).toHaveBeenCalledOnce(); });
});
