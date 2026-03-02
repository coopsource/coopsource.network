import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN, wp, setupCooperative, loginAs } from './helpers.js';

const API = 'http://localhost:3002/api/v1';

/** Create an agent via the API and return its id. */
async function createTestAgent(
  request: APIRequestContext,
  cookie: string,
): Promise<string> {
  const res = await request.post(`${API}/agents/from-template`, {
    headers: { Cookie: cookie },
    data: { agentType: 'facilitator', name: 'E2E Test Agent' },
  });
  if (!res.ok()) {
    throw new Error(`Create agent failed (${res.status()}): ${await res.text()}`);
  }
  const body = await res.json();
  return body.id;
}

test.describe('Agents — Triggers Tab', () => {
  let cookie: string;
  let agentId: string;

  test.beforeEach(async ({ page, request }) => {
    const setup = await setupCooperative(request);
    cookie = setup.cookie;
    agentId = await createTestAgent(request, cookie);
    await loginAs(page, ADMIN.email, ADMIN.password);
  });

  test('agent detail page shows Chat and Triggers tabs', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await expect(page.getByRole('tab', { name: 'Chat' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Triggers/ })).toBeVisible();
  });

  test('triggers tab shows empty state by default', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await expect(page.getByText('No triggers configured')).toBeVisible();
    await expect(page.getByText('Create a trigger to automate responses to events')).toBeVisible();
  });

  test('triggers tab shows "New Trigger" button', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await expect(page.getByRole('button', { name: 'New Trigger' })).toBeVisible();
  });

  test('clicking "New Trigger" opens create form', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();

    // Form elements should be visible
    await expect(page.getByLabel('Event Type')).toBeVisible();
    await expect(page.getByLabel('Prompt Template')).toBeVisible();
    await expect(page.getByLabel('Cooldown (seconds)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Trigger' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('cancel button closes create form', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();
    await expect(page.getByLabel('Event Type')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByLabel('Event Type')).not.toBeVisible();
  });

  test('create trigger with prompt template', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();

    // Fill form — event type defaults to first option (member.joined)
    await page.getByLabel('Prompt Template').fill('A new member has joined. Please welcome them.');
    await page.getByRole('button', { name: 'Create Trigger' }).click();

    // Form should close and trigger should appear in the list
    await expect(page.getByLabel('Event Type')).not.toBeVisible();
    await expect(page.getByText('member.joined')).toBeVisible();
    await expect(page.getByText('prompt template')).toBeVisible();
  });

  test('created trigger has enabled toggle', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();
    await page.getByLabel('Prompt Template').fill('Test prompt');
    await page.getByRole('button', { name: 'Create Trigger' }).click();

    // The toggle switch checkbox should be present and checked
    await expect(page.getByText('member.joined')).toBeVisible();
    const toggle = page.locator('input[type="checkbox"].sr-only');
    await expect(toggle).toBeChecked();
  });

  test('trigger count badge updates in tab', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();
    await page.getByLabel('Prompt Template').fill('Test prompt');
    await page.getByRole('button', { name: 'Create Trigger' }).click();

    // Tab should now show count
    await expect(page.getByRole('tab', { name: /Triggers/ })).toContainText('1');
  });

  test('delete trigger removes it from the list', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();
    await page.getByLabel('Prompt Template').fill('Delete me');
    await page.getByRole('button', { name: 'Create Trigger' }).click();
    await expect(page.getByText('member.joined')).toBeVisible();

    // Click the delete button (trash icon)
    await page.locator('button:has(svg.lucide-trash-2)').click();

    // Trigger should be gone, back to empty state
    await expect(page.getByText('No triggers configured')).toBeVisible();
  });

  test('expand trigger shows execution log section', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();
    await page.getByLabel('Prompt Template').fill('Expand test');
    await page.getByRole('button', { name: 'Create Trigger' }).click();
    await expect(page.getByText('member.joined')).toBeVisible();

    // Click the expand chevron
    await page.locator('button:has(svg.lucide-chevron-right)').click();

    await expect(page.getByText('Recent Executions')).toBeVisible();
    await expect(page.getByText('No executions yet')).toBeVisible();
  });

  test('switching back to Chat tab shows chat interface', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await expect(page.getByText('No triggers configured')).toBeVisible();

    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByText(/Start a conversation/)).toBeVisible();
    await expect(page.getByPlaceholder('Type a message...')).toBeVisible();
  });

  test('create trigger with conditions and actions', async ({ page }) => {
    await page.goto(wp(`/agents/${agentId}`));
    await page.getByRole('tab', { name: /Triggers/ }).click();
    await page.getByRole('button', { name: 'New Trigger' }).click();

    // Select event type
    await page.getByLabel('Event Type').selectOption('proposal.opened');

    // Add a condition
    await page.getByText('+ Add', { exact: false }).first().click();
    const conditionRow = page.locator('input[placeholder="field"]');
    await conditionRow.fill('data.title');
    await page.locator('input[placeholder="value"]').fill('urgent');

    // Add an action (notify)
    await page.getByText('+ Add', { exact: false }).nth(1).click();
    await page.locator('input[placeholder="Notification title"]').fill('New Proposal Alert');
    await page.locator('input[placeholder="Notification body"]').fill('A proposal was opened.');

    await page.getByRole('button', { name: 'Create Trigger' }).click();

    // Verify trigger created with condition and action badges
    await expect(page.getByText('proposal.opened')).toBeVisible();
    await expect(page.getByText('1 condition')).toBeVisible();
    await expect(page.getByText('notify')).toBeVisible();
  });
});
