import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import Notepad from './Notepad';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

describe('Notepad', () => {
  it('renders without crashing', () => {
    render(<Notepad onTransferToTTS={() => {}} />);
    // Just asserting that it renders something
    expect(document.body).toBeDefined();
  });
});
