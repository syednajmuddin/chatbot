/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React from 'react';

interface GettingStartedProps {
  onClose: () => void;
}

export function GettingStarted({onClose}: GettingStartedProps) {
  return (
    <div
      className="getting-started-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="getting-started-title">
      <div className="getting-started-content">
        <button
          className="getting-started-close"
          onClick={onClose}
          aria-label="Close getting started guide">
          &times;
        </button>
        <main>
          <h1 id="getting-started-title">Getting Started</h1>
          <p className="getting-started-description">
            Generate images or text and select different elements to bring up
            contextual menus of GenAI actions
          </p>
          <video
            src="https://www.gstatic.com/aistudio/zero-state/media_sim_instructions.mp4"
            width="100%"
            controls
            playsInline
            loop
            aria-label="Branch out from one generation to the next with multimodal workflows"
          />
        </main>
      </div>
    </div>
  );
}
