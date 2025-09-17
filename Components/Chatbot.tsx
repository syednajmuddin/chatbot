/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {Chat, GoogleGenAI} from '@google/genai';
import {FormEvent, useEffect, useRef, useState} from 'react';

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const GEMINI_MODEL_NAME = 'gemini-2.5-flash';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface ChatbotProps {
  onClose: () => void;
}

const SYSTEM_INSTRUCTION = `You are a friendly and helpful virtual assistant for students at 'Generative AI University'. Your role is to answer questions about courses, schedules, university policies, and campus life. You do not have access to real-time personal student data like grades or attendance, but you can answer general questions about these topics. Be concise and clear in your responses. Keep your answers brief and to the point.`;

export function Chatbot({onClose}: ChatbotProps) {
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chatInstance = ai.chats.create({
      model: GEMINI_MODEL_NAME,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    setChat(chatInstance);
    setMessages([
      {
        role: 'model',
        text: "Hello! I'm the university assistant. How can I help you today?",
      },
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  }, [messages]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !chat) return;

    const userMessage: Message = {role: 'user', text: input};
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chat.sendMessage({message: input});
      const modelMessage: Message = {role: 'model', text: response.text};
      setMessages((prev) => [...prev, modelMessage]);
    } catch (error) {
      console.error('Gemini API error:', error);
      const errorMessage: Message = {
        role: 'model',
        text: 'Sorry, I encountered an error. Please try again.',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="chatbot-window"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chatbot-title">
      <header className="chatbot-header">
        <h2 id="chatbot-title">University Assistant</h2>
        <button
          onClick={onClose}
          className="chatbot-close-btn"
          aria-label="Close chat">
          &times;
        </button>
      </header>
      <div className="chatbot-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <p style={{whiteSpace: 'pre-wrap', margin: 0}}>{msg.text}</p>
          </div>
        ))}
        {isLoading && (
          <div className="message model">
            <div className="loading-dots">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form className="chatbot-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          className="chatbot-input"
          aria-label="Chat input"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="chatbot-send-btn"
          disabled={isLoading || !input.trim()}
          aria-label="Send message">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
