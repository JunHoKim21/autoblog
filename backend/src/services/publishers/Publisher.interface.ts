export interface PublishParams {
  title: string;
  content: string;
  mediaPaths: string[];
}

export interface PublishResult {
  success: boolean;
  externalUrl?: string;
  error?: string;
}

export abstract class BasePublisher {
  constructor(protected config: any) {}
  abstract publish(params: PublishParams): Promise<PublishResult>;
}
