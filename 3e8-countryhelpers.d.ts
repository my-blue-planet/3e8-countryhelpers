type countryList = string[]
export declare function getCountry(long: number, lat: number): string;
export declare const countryList: countryList;
export declare function getCountryIndex(long: number, lat: number): number & keyof countryList

export {};