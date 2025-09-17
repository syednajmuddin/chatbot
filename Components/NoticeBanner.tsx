/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import React, {useState} from 'react';

declare global {
  interface AIStudio {
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

function ExternalLinkIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        marginLeft: '4px',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>
  );
}

export function NoticeBanner() {
  const [isVisible, setIsVisible] = useState(true);

  const handleSelectKeyClick = async (
    e: React.MouseEvent<HTMLAnchorElement>,
  ) => {
    e.preventDefault();
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
    } else {
      console.log('window.aistudio.openSelectKey() not available.');
      alert('API key selection is not available in this environment.');
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="notice-banner">
      Video generation with Veo 3 is only available on the Paid Tier -&nbsp;
      <a href="#" onClick={handleSelectKeyClick}>
        click here
      </a>
      &nbsp;to add your API key (see&nbsp;
      <a
        href="https://ai.google.dev/gemini-api/docs/pricing?example=dialogue#veo-3"
        target="_blank"
        rel="noopener noreferrer">
        pricing
        <ExternalLinkIcon />
      </a>
      &nbsp;for more details).&nbsp;
      <button
        className="notice-bar-close"
        onClick={() => setIsVisible(false)}
        aria-label="Close notice">
        &times;
      </button>
    </div>
  );
}
