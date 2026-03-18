import { CompareCurl } from "../../../wailsjs/go/curl_compare/Service";
import type {
  CompareCurlInput,
  CompareCurlOutput,
} from "../../../wailsjs/go/models";

export type { CompareCurlOutput };

export async function runCompareCurl(
  input: CompareCurlInput
): Promise<CompareCurlOutput> {
  return CompareCurl(input);
}
