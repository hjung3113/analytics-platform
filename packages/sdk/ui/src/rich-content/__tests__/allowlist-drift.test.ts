// Fixed canonical snapshot: full AttrSchema bounds/enums and unaffected surface contracts.
import { describe, expect, it } from 'vitest';
import { UI_ALLOWLISTS, UI_RICH_CONTENT_EXTENSION_CAPABILITIES, UI_SURFACE_EXTENSION_CAPABILITIES, UI_SURFACES } from '../allowlist-local';
const EXPECTED = {
  "surfaces": [
    "voc-description",
    "reporter-reply",
    "public-update",
    "internal-comment"
  ],
  "capabilities": [
    "bold",
    "italic",
    "underline",
    "code",
    "list",
    "link",
    "mention",
    "attachmentRef",
    "heading",
    "strike",
    "highlight",
    "color",
    "blockquote",
    "horizontalRule",
    "codeBlock",
    "taskList",
    "table",
    "details",
    "tableOfContents",
    "image"
  ],
  "surfaceCapabilities": {
    "voc-description": [
      "bold",
      "italic",
      "underline",
      "code",
      "list",
      "link",
      "attachmentRef",
      "heading",
      "strike",
      "highlight",
      "color",
      "blockquote",
      "horizontalRule",
      "codeBlock",
      "taskList",
      "table",
      "details",
      "tableOfContents",
      "image"
    ],
    "reporter-reply": [
      "bold",
      "italic",
      "link",
      "attachmentRef"
    ],
    "public-update": [
      "bold",
      "italic",
      "list"
    ],
    "internal-comment": [
      "bold",
      "italic",
      "code",
      "list",
      "link",
      "mention",
      "attachmentRef"
    ]
  },
  "allowlists": {
    "voc-description": {
      "nodes": [
        "attachmentRef",
        "blockquote",
        "bulletList",
        "codeBlock",
        "details",
        "detailsContent",
        "detailsSummary",
        "doc",
        "heading",
        "horizontalRule",
        "image",
        "listItem",
        "orderedList",
        "paragraph",
        "table",
        "tableCell",
        "tableHeader",
        "tableOfContents",
        "tableRow",
        "taskItem",
        "taskList",
        "text"
      ],
      "leafNodes": [
        "attachmentRef",
        "horizontalRule",
        "image",
        "tableOfContents"
      ],
      "marks": [
        "bold",
        "code",
        "highlight",
        "italic",
        "link",
        "strike",
        "textStyle",
        "underline"
      ],
      "nodeAttrs": {
        "attachmentRef": {
          "id": {
            "kind": "uuid",
            "required": true
          }
        },
        "image": {
          "id": {
            "kind": "uuid",
            "required": true
          },
          "width": {
            "kind": "int",
            "min": 80,
            "max": 4096,
            "required": false
          }
        },
        "heading": {
          "level": {
            "kind": "int",
            "min": 1,
            "max": 3,
            "required": false
          }
        },
        "codeBlock": {
          "language": {
            "kind": "enum",
            "values": [
              "javascript",
              "typescript",
              "json",
              "sql",
              "python",
              "bash",
              "java"
            ],
            "nullable": true,
            "required": false
          }
        },
        "taskItem": {
          "checked": {
            "kind": "boolean",
            "required": false
          }
        },
        "tableCell": {
          "colspan": {
            "kind": "int",
            "min": 1,
            "max": 20,
            "required": false
          },
          "rowspan": {
            "kind": "int",
            "min": 1,
            "max": 20,
            "required": false
          },
          "colwidth": {
            "kind": "intArray",
            "min": 25,
            "max": 4096,
            "maxLen": 20,
            "required": false
          }
        },
        "tableHeader": {
          "colspan": {
            "kind": "int",
            "min": 1,
            "max": 20,
            "required": false
          },
          "rowspan": {
            "kind": "int",
            "min": 1,
            "max": 20,
            "required": false
          },
          "colwidth": {
            "kind": "intArray",
            "min": 25,
            "max": 4096,
            "maxLen": 20,
            "required": false
          }
        },
        "details": {
          "open": {
            "kind": "boolean",
            "required": false
          }
        }
      },
      "markAttrs": {
        "link": {
          "href": {
            "kind": "url",
            "schemes": [
              "http:",
              "https:"
            ],
            "maxLen": 2048,
            "required": true
          }
        },
        "highlight": {
          "color": {
            "kind": "enum",
            "values": [
              "default",
              "info",
              "success",
              "warning",
              "danger"
            ],
            "required": false
          }
        },
        "textStyle": {
          "color": {
            "kind": "enum",
            "values": [
              "default",
              "info",
              "success",
              "warning",
              "danger"
            ],
            "required": false
          }
        }
      },
      "allowedLinkSchemes": [
        "http:",
        "https:"
      ],
      "maxTextBytes": 51200,
      "maxDepth": 32,
      "maxNodes": 5000,
      "maxMarks": 1000
    },
    "public-update": {
      "nodes": [
        "bulletList",
        "doc",
        "listItem",
        "orderedList",
        "paragraph",
        "text"
      ],
      "leafNodes": [],
      "marks": [
        "bold",
        "italic"
      ],
      "nodeAttrs": {},
      "markAttrs": {},
      "allowedLinkSchemes": [],
      "maxTextBytes": 51200,
      "maxDepth": 32,
      "maxNodes": 5000,
      "maxMarks": 1000
    },
    "reporter-reply": {
      "nodes": [
        "attachmentRef",
        "bulletList",
        "doc",
        "listItem",
        "orderedList",
        "paragraph",
        "text"
      ],
      "leafNodes": [
        "attachmentRef"
      ],
      "marks": [
        "bold",
        "italic",
        "link"
      ],
      "nodeAttrs": {
        "attachmentRef": {
          "id": {
            "kind": "uuid",
            "required": true
          }
        }
      },
      "markAttrs": {
        "link": {
          "href": {
            "kind": "url",
            "schemes": [
              "http:",
              "https:"
            ],
            "maxLen": 2048,
            "required": true
          }
        }
      },
      "allowedLinkSchemes": [
        "http:",
        "https:"
      ],
      "maxTextBytes": 51200,
      "maxDepth": 32,
      "maxNodes": 5000,
      "maxMarks": 1000
    },
    "internal-comment": {
      "nodes": [
        "attachmentRef",
        "bulletList",
        "codeBlock",
        "doc",
        "listItem",
        "mention",
        "orderedList",
        "paragraph",
        "text"
      ],
      "leafNodes": [
        "attachmentRef",
        "mention"
      ],
      "marks": [
        "bold",
        "code",
        "italic",
        "link"
      ],
      "nodeAttrs": {
        "attachmentRef": {
          "id": {
            "kind": "uuid",
            "required": true
          }
        },
        "mention": {
          "actor_id": {
            "kind": "uuid",
            "required": true
          }
        },
        "codeBlock": {
          "language": {
            "kind": "string",
            "maxLen": 32,
            "nullable": true,
            "required": false
          }
        }
      },
      "markAttrs": {
        "link": {
          "href": {
            "kind": "url",
            "schemes": [
              "http:",
              "https:"
            ],
            "maxLen": 2048,
            "required": true
          }
        }
      },
      "allowedLinkSchemes": [
        "http:",
        "https:"
      ],
      "maxTextBytes": 51200,
      "maxDepth": 32,
      "maxNodes": 5000,
      "maxMarks": 1000
    }
  }
}
;
describe('UI allowlist canonical snapshot drift', () => {
  it('pins nodes, leaves, marks, full attribute schemas, capabilities and DoS caps', () => {
    const actual = { surfaces: UI_SURFACES, capabilities: UI_RICH_CONTENT_EXTENSION_CAPABILITIES, surfaceCapabilities: UI_SURFACE_EXTENSION_CAPABILITIES, allowlists: UI_ALLOWLISTS };
    expect(JSON.parse(JSON.stringify(actual, (_key, value) => value instanceof Set ? [...value].sort() : value))).toEqual(EXPECTED);
  });
});
