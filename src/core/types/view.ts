export interface View {
  id: string;
  name: string;
  content: string;
  metadata?: {
    capturedAt: number;
    selector: string;
  };
}

export interface PageContext {
  url: string;
  domain: string;
  title: string;
  screenshot: string;
  domStructure: DOMStructure;
}

export interface DOMStructure {
  buttons: Array<{ text: string; selector: string }>;
  tabs: Array<{ text: string; selector: string }>;
  sections: Array<{ heading: string; selector: string }>;
}
