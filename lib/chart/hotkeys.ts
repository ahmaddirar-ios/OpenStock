// Keyboard shortcuts for the chart's drawing tools, in one table so the handler and the help panel
// can never disagree about what a key does.
//
// A key is one letter and no modifier: the editor shortcuts (undo, copy, paste) all live behind
// Meta/Ctrl, so a bare letter is free. Text fields opt out — typing "fib" in a search box must not
// arm the Fibonacci tool.

import type { ShapeTool } from '@/lib/chart/drawings';
import type { StringKey } from '@/lib/i18n';

export type ToolShortcut = { key: string; tool: ShapeTool };

/** The ten tools a trader reaches for mid-session; the rest stay in the rail. */
export const TOOL_SHORTCUTS: readonly ToolShortcut[] = [
    { key: 't', tool: 'trend' },
    { key: 'h', tool: 'horizontal' },
    { key: 'r', tool: 'rectangle' },
    { key: 'f', tool: 'fib' },
    { key: 'a', tool: 'arrow' },
    { key: 'c', tool: 'channel' },
    { key: 'e', tool: 'ellipse' },
    { key: 'b', tool: 'brush' },
    { key: 'x', tool: 'text' },
    { key: 'p', tool: 'pricetime' },
];

/** The ruler is a gesture, not a shape, so it has its own key rather than a `ShapeTool` entry. */
export const MEASURE_KEY = 'm';

const BY_KEY = new Map(TOOL_SHORTCUTS.map((shortcut) => [shortcut.key, shortcut.tool]));
const BY_TOOL = new Map(TOOL_SHORTCUTS.map((shortcut) => [shortcut.tool, shortcut.key]));

/** The tool a bare letter arms, or null when the letter belongs to something else. */
export const toolForKey = (key: string): ShapeTool | null => BY_KEY.get((key || '').toLowerCase()) ?? null;

/** The letter that arms a tool, or null when the tool lives only in the rail. */
export const hotkeyForTool = (tool: ShapeTool): string | null => BY_TOOL.get(tool) ?? null;

export type EditShortcut = { keys: string; labelKey: StringKey };

/** The editing shortcuts, listed for the help panel. The handler itself lives with the chart. */
export const EDIT_SHORTCUTS: readonly EditShortcut[] = [
    { keys: '⌘/Ctrl + Z', labelKey: 'chart.shortcut.undo' },
    { keys: '⌘/Ctrl + ⇧ + Z', labelKey: 'chart.shortcut.redo' },
    { keys: '⌘/Ctrl + C', labelKey: 'chart.shortcut.copy' },
    { keys: '⌘/Ctrl + V', labelKey: 'chart.shortcut.paste' },
    { keys: '⌘/Ctrl + D', labelKey: 'chart.shortcut.duplicate' },
    { keys: 'Esc', labelKey: 'chart.shortcut.cancel' },
    { keys: '?', labelKey: 'chart.shortcut.help' },
];

/**
 * Replay trading keys. They all carry Shift, because a bare letter already arms a drawing tool
 * and a replay is exactly when a trader is most likely to hit one by accident. The handler lives
 * in ReplayPanel, which is the only place that knows the quantity and the armed order type.
 */
export const REPLAY_SHORTCUTS: readonly EditShortcut[] = [
    { keys: '⇧ + B', labelKey: 'replay.key.buy' },
    { keys: '⇧ + S', labelKey: 'replay.key.sell' },
    { keys: '⇧ + X', labelKey: 'replay.key.flatten' },
    { keys: 'Space', labelKey: 'replay.key.play' },
];
