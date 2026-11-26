import { homeModel } from "./home.model";

export function getHomeViewModel() {
  return {
    heading: homeModel.name,
    description: homeModel.description,
  };
}

export type HomeViewModel = ReturnType<typeof getHomeViewModel>;
