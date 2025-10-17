export interface ElementSnapshot {
  text: string;
  value: string | null;
  styleAttribute: string | null;
  attributes: Record<string, string>;
  inlineStyles: Record<string, string>;
  computed: Record<string, string>;
}

export interface ManualChildDescriptor {
  index: number;
  descriptor: string;
}

export interface ManualEditorState {
  active: boolean;
  descriptor: string | null;
  snapshot: ElementSnapshot | null;
  children: ManualChildDescriptor[];
  theme: 'light' | 'dark';
}
