import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types.js';
import { createApiClient, ApiError } from '$lib/api/client.js';

export const load: PageServerLoad = async ({ fetch, request, parent }) => {
  const cookie = request.headers.get('cookie') ?? undefined;
  const api = createApiClient(fetch, cookie);
  const { workspace } = await parent();
  const coopDid = workspace.cooperative.did;

  const result = await api.getScripts(coopDid);

  return {
    scripts: result.items,
    coopDid,
  };
};

/** Extract coopDid from form data (passed as hidden field from the page). */
function extractCoopDid(data: FormData): string {
  return String(data.get('coopDid') ?? '').trim();
}

export const actions: Actions = {
  create: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const sourceCode = String(data.get('sourceCode') ?? '').trim();
    const phase = String(data.get('phase') ?? '').trim();
    const collectionsStr = String(data.get('collections') ?? '').trim();
    const eventTypesStr = String(data.get('eventTypes') ?? '').trim();
    const configStr = String(data.get('config') ?? '').trim();
    const timeoutMs = Number(data.get('timeoutMs') ?? '5000');

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });
    if (!name) return fail(400, { error: 'Name is required.' });
    if (!sourceCode) return fail(400, { error: 'Source code is required.' });
    if (!phase) return fail(400, { error: 'Phase is required.' });

    let config: Record<string, unknown> | undefined;
    if (configStr) {
      try {
        config = JSON.parse(configStr) as Record<string, unknown>;
      } catch {
        return fail(400, { error: 'Config must be valid JSON.' });
      }
    }

    const collections = collectionsStr ? collectionsStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const eventTypes = eventTypesStr ? eventTypesStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.createScript(coopDid, {
        name,
        sourceCode,
        phase,
        description: description || undefined,
        collections,
        eventTypes,
        config,
        timeoutMs,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to create script.' });
    }
  },

  update: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const id = String(data.get('id') ?? '').trim();
    const name = String(data.get('name') ?? '').trim();
    const description = String(data.get('description') ?? '').trim();
    const sourceCode = String(data.get('sourceCode') ?? '').trim();
    const phase = String(data.get('phase') ?? '').trim();
    const collectionsStr = String(data.get('collections') ?? '').trim();
    const eventTypesStr = String(data.get('eventTypes') ?? '').trim();
    const configStr = String(data.get('config') ?? '').trim();
    const timeoutMs = Number(data.get('timeoutMs') ?? '5000');

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });
    if (!id) return fail(400, { error: 'Script ID is required.' });

    let config: Record<string, unknown> | undefined;
    if (configStr) {
      try {
        config = JSON.parse(configStr) as Record<string, unknown>;
      } catch {
        return fail(400, { error: 'Config must be valid JSON.' });
      }
    }

    const collections = collectionsStr ? collectionsStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
    const eventTypes = eventTypesStr ? eventTypesStr.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.updateScript(coopDid, id, {
        name: name || undefined,
        sourceCode: sourceCode || undefined,
        phase: phase || undefined,
        description: description || undefined,
        collections,
        eventTypes,
        config,
        timeoutMs,
      });
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to update script.' });
    }
  },

  delete: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const id = String(data.get('id') ?? '').trim();

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.deleteScript(coopDid, id);
      return { deleteSuccess: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to delete script.' });
    }
  },

  enable: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const id = String(data.get('id') ?? '').trim();

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.enableScript(coopDid, id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to enable script.' });
    }
  },

  disable: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const id = String(data.get('id') ?? '').trim();

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      await api.disableScript(coopDid, id);
      return { success: true };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to disable script.' });
    }
  },

  test: async ({ request, fetch }) => {
    const data = await request.formData();
    const coopDid = extractCoopDid(data);
    const id = String(data.get('id') ?? '').trim();

    if (!coopDid) return fail(400, { error: 'Cooperative DID is required.' });

    const cookie = request.headers.get('cookie') ?? undefined;
    const api = createApiClient(fetch, cookie);
    try {
      const result = await api.testScript(coopDid, id);
      return { testResult: result, testedId: id };
    } catch (err) {
      if (err instanceof ApiError) return fail(err.status, { error: err.message });
      return fail(500, { error: 'Failed to test script.' });
    }
  },
};
