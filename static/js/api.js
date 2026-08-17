// API key management and explanation parsing
export const API = {
  getApiKey() {
    return localStorage.getItem('gemini_api_key') || '';
  },

  setApiKey(key) {
    localStorage.setItem('gemini_api_key', key.trim());
  },

  clearApiKey() {
    localStorage.removeItem('gemini_api_key');
  },

  // Calls backend FastAPI proxy for AI generation
  async fetchExplanation(topic, moduleName, context = null) {
    const apiKey = this.getApiKey();
    try {
      const response = await fetch('/api/explain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topic,
          module: moduleName,
          context,
          apiKey: apiKey || null
        })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("API Call Error:", error);
      throw error;
    }
  }
};

// Custom parser to translate markdown and custom alerts into beautiful styled HTML
export function parseMarkdown(md) {
  if (!md) return '';
  
  let html = md.replace(/\r\n/g, '\n');
  const lines = html.split('\n');
  
  let inList = false;
  let inQuote = false;
  let quoteType = ''; // 'note', 'tip', 'important', 'warning'
  let quoteLines = [];
  const parsedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // 1. Process Blockquotes and GitHub Alerts
    if (line.startsWith('>')) {
      const content = line.substring(1).trim();
      
      // Detect GitHub Alert labels
      if (content.startsWith('[!NOTE]')) {
        quoteType = 'note';
        continue;
      } else if (content.startsWith('[!TIP]')) {
        quoteType = 'tip';
        continue;
      } else if (content.startsWith('[!IMPORTANT]')) {
        quoteType = 'important';
        continue;
      } else if (content.startsWith('[!WARNING]')) {
        quoteType = 'warning';
        continue;
      }
      
      quoteLines.push(content);
      inQuote = true;
      continue;
    } else {
      if (inQuote) {
        // Flush active blockquote
        const quoteContent = parseMarkdownInline(quoteLines.join(' '));
        const cssClass = quoteType ? `alert-${quoteType}` : '';
        parsedLines.push(`<blockquote class="${cssClass}"><p>${quoteContent}</p></blockquote>`);
        inQuote = false;
        quoteType = '';
        quoteLines = [];
      }
    }
    
    // 2. Process Lists (bullet points)
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        parsedLines.push('<ul>');
        inList = true;
      }
      const itemContent = parseMarkdownInline(line.substring(2));
      parsedLines.push(`<li>${itemContent}</li>`);
      continue;
    } else {
      if (inList) {
        parsedLines.push('</ul>');
        inList = false;
      }
    }
    
    // 3. Process Headings
    if (line.startsWith('### ')) {
      parsedLines.push(`<h3>${parseMarkdownInline(line.substring(4))}</h3>`);
    } else if (line.startsWith('#### ')) {
      parsedLines.push(`<h4>${parseMarkdownInline(line.substring(5))}</h4>`);
    } else if (line.startsWith('## ')) {
      parsedLines.push(`<h2>${parseMarkdownInline(line.substring(3))}</h2>`);
    } else if (line.startsWith('# ')) {
      parsedLines.push(`<h1>${parseMarkdownInline(line.substring(2))}</h1>`);
    }
    // 4. Standard Paragraphs
    else if (line !== '') {
      parsedLines.push(`<p>${parseMarkdownInline(line)}</p>`);
    }
  }
  
  // Clean up dangling tags at end of file
  if (inQuote) {
    const quoteContent = parseMarkdownInline(quoteLines.join(' '));
    const cssClass = quoteType ? `alert-${quoteType}` : '';
    parsedLines.push(`<blockquote class="${cssClass}"><p>${quoteContent}</p></blockquote>`);
  }
  if (inList) {
    parsedLines.push('</ul>');
  }
  
  return parsedLines.join('\n');
}

// Inline formatting (bold, italic, code, chemistry subscripts)
function parseMarkdownInline(text) {
  let res = text;
  
  // Bold: **text**
  res = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic: *text*
  res = res.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Inline Code: `code`
  res = res.replace(/`(.*?)`/g, '<code>$1</code>');
  
  // Chemistry subscripts (converts $H_2O$ or $CO_2$ to H<sub>2</sub>O or CO<sub>2</sub>)
  res = res.replace(/\$(.*?)\$/g, (match, formula) => {
    // Replace all numbers in the formula with subscript tags
    return formula.replace(/(\d+)/g, '<sub>$1</sub>');
  });
  
  return res;
}
