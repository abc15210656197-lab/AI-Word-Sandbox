export const replacer = (key: string, value: any) => {
  // Filter out React internal properties
  if (key.startsWith('__react') || key === '_owner' || key === '_store' || key === '_self' || key === '_source') {
    return undefined;
  }
  // Handle DOM elements
  if (value && typeof value === 'object' && 'nodeType' in value) {
    return "[DOMNode]";
  }
  // Handle File objects
  if (value instanceof File) {
    return `[File: ${value.name}]`;
  }
  return value;
};
