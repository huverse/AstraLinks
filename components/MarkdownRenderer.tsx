import React, { useMemo } from 'react';
import { marked } from 'marked';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

// Configure marked for security
marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Convert \n to <br>
});

/**
 * Secure Markdown renderer component using the `marked` library.
 * Supports GitHub Flavored Markdown with line breaks.
 */
export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
    const htmlContent = useMemo(() => {
        if (!content) return '';
        try {
            // Parse markdown to HTML
            const html = marked.parse(content);
            return typeof html === 'string' ? html : '';
        } catch (e) {
            console.error('Markdown parse error:', e);
            return content.replace(/\n/g, '<br/>');
        }
    }, [content]);

    return (
        <div
            className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
    );
}
