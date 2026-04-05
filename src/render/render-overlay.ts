export type RenderOverlayRequest = {
  inputPath: string;
  configPath: string;
  outputPath: string;
};

export type RenderOverlayResult = {
  exitCode: number;
  message: string;
};

export const renderOverlay = async (
  request: RenderOverlayRequest,
): Promise<RenderOverlayResult> => {
  console.log("Render pipeline stub invoked.");
  console.log(`Resolved input path: ${request.inputPath}`);
  console.log(`Resolved config path: ${request.configPath}`);
  console.log(`Resolved output path: ${request.outputPath}`);

  return {
    exitCode: 0,
    message: "Render pipeline is not implemented yet.",
  };
};
