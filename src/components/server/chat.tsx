"use client";

import React, { useState } from 'react';
import { MessageSquare, Send, Clock, Save, Trash2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Template {
  id: string;
  name: string;
  message: string;
}

interface ServerChatProps {
  onBroadcast: (message: string) => Promise<string>;
}

export function ServerChat({ onBroadcast }: ServerChatProps) {
  const [message, setMessage] = useState('');
  const [templates, setTemplates] = useState<Template[]>([
    { id: '1', name: 'Welcome', message: 'Welcome to the server! Join our Discord: discord.gg/cs2' },
    { id: '2', name: 'Rules', message: 'No hacking, no griefing. Play fair!' },
  ]);

  const handleBroadcast = () => {
    if (!message.trim()) return;
    onBroadcast(message);
    // Not clearing message to allow spamming as requested
  };

  return (
    <div className="p-3 md:p-6 space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Chat Input */}
        <div className="space-y-4">
          <div className="p-6 rounded-xl border border-border bg-[#09090b]">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <MessageSquare size={18} className="mr-2 text-primary" />
              Send Proadcast
            </h3>
            <div className="space-y-4">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message to all players..."
                className="w-full h-32 bg-white/5 border border-border rounded-md p-3 text-sm text-white resize-none focus:ring-1 focus:ring-primary outline-none"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground italic">Sending as: <span className="text-primary font-bold">Console</span></span>
                <Button 
            onClick={handleBroadcast}
            className="bg-primary hover:bg-primary/90 text-primary-foreground h-11 px-6 rounded-l-none"
          >
            Broadcast
          </Button>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-border bg-[#09090b]">
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <Clock size={18} className="mr-2 text-primary" />
              Auto-Messages (Cron)
            </h3>
            <div className="text-sm text-muted-foreground/50 italic py-4 text-center border border-dashed border-border rounded-md">
              No scheduled messages active.
            </div>
            <Button variant="outline" className="w-full mt-4 border-dashed">
              <Plus size={14} className="mr-2" />
              Add Scheduled Message
            </Button>
          </div>
        </div>

        {/* Templates */}
        <div className="p-6 rounded-xl border border-border bg-[#09090b]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center">
              <Save size={18} className="mr-2 text-primary" />
              Quick Templates
            </h3>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <Plus size={16} />
            </Button>
          </div>
          
          <ScrollArea className="h-[400px]">
            <div className="space-y-2 pr-4">
              {templates.map((template) => (
                <div key={template.id} className="p-3 rounded-lg border border-border bg-white/5 hover:border-primary/30 transition-all group">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-white">{template.name}</span>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => setMessage(template.message)} className="p-1 hover:text-primary" title="Use template">
                         <Send size={12} />
                       </button>
                       <button className="p-1 hover:text-red-500" title="Delete">
                         <Trash2 size={12} />
                       </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{template.message}</p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
