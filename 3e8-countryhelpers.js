
export const getCountry = createCountryFinder(countriesRaw).getCountry
export const getCountryIndex = createCountryFinder(countriesRaw).getCountryIndex
export const countryList = createCountryFinder(countriesRaw).countryList

export function createCompressor() {
	const base64urlChars = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'.split("").sort().join("")
	const f = (2**24 - 1) / 180
	const digit = (d, exponent) => (2 ** exponent) * base64urlChars.indexOf(d)
	const b64coordToInt = (dddd) => digit(dddd[0], 18) + digit(dddd[1], 12) + digit(dddd[2], 6) + digit(dddd[3], 0)
	const b64ToIntInt = (dddddddd) => [b64coordToInt(dddddddd.slice(0,4)), b64coordToInt(dddddddd.slice(4,8))]
	const intToLat = (int) => int / f - 90
	const intToLong = (int) => int / (0.5 * f) - 180
	const pick64 = (num) => base64urlChars[num % 64]
	const toBase64 = (n) => {
		const b64 = pick64(n >> 18) + pick64(n >> 12) + pick64(n >> 6) + pick64(n)
		if(b64coordToInt(b64) !== n) {
			console.warn("error base64 ", n , b64, b64coordToInt(b64), intToLong(n))
		}
		return b64
	}
	// const coordToBase64 = (long, lat) => {
	// 	const [longInt, latInt] = b64coordToInt([long, lat])
	// 	return toBase64(longInt) + toBase64(latInt)
	// }
	const coordsToInt = ([long, lat]) => {
		const longBytes = Math.round((long + 180) * 0.5 * f)
		const latBytes = Math.round((lat + 90) * f)
		return [longBytes, latBytes]
	}
	const encode = (points) => {
		let [currentLongInt, currentLatInt] = coordsToInt(points[0])
		let str = toBase64(currentLongInt) + toBase64(currentLatInt)
		const deltaToB64 = (next, current) => {
			const deltaN = next - current + 32*64
			if(deltaN < 0 || deltaN >= 64*64 - 1) {
				return "zz" + toBase64(next)
			}
			else {
				console.assert(toBase64(deltaN).startsWith("--"), "error encoding")
				return toBase64(deltaN).slice(2,4)
			}
		}
		for(let p of points.slice(1)) {
			let [lo, la] = coordsToInt(p)
			str += deltaToB64(lo, currentLongInt)
			str += deltaToB64(la, currentLatInt)
			currentLongInt = lo
			currentLatInt = la
		}
		return str
	}
	const decode = (str) => {
		let [long, lat] = b64ToIntInt(str.slice(0,8))
		const toPoint = (longInt, latInt) => [intToLong(longInt), intToLat(latInt)]
		let points = [toPoint(long, lat)]
		const parseCoord = (str, i, currentCoord) => {
			if(str.slice(i, i+2) === "zz") {
				const coord = b64coordToInt(str.slice(i+2, i+6))
				return {coord, index: i+6}
			}
			else {
				const delta = b64coordToInt(`--${str.slice(i, i+2)}`) - 32*64
				return {coord: currentCoord + delta, index: i+2}
			}
		}
		let i = 8
		while(i < str.length) {
			let ci = parseCoord(str, i, long)
			long = ci.coord
			i = ci.index
			ci = parseCoord(str, i, lat)
			lat = ci.coord
			i = ci.index
			points.push(toPoint(long, lat))
		}
		return points
	}
	return {encode, decode}
}

export function createCountryFinder(countriesRaw) {
	const countryList = countriesRaw.map(c=>c.name).concat(["Ocean"])
	const inflate = (countriesRaw) => {
		let allpolys = []
		const decode = createCompressor().decode
		for(let c of countriesRaw) {
			const polys = c.polys.map(decode).map(poly=>{
				let west = Infinity
				let east = -Infinity
				let south = Infinity
				let north = -Infinity
				for(let point of poly) {
					const [long, lat] = point
					if(lat < south) south = lat
					if(lat > north) north = lat
					if(long < west) west = long
					if(long > east) east = long
				}
				return {east, west, north, south, points: poly, country: c.name, iso: c.iso}
			})
			allpolys = allpolys.concat(polys)
		}
		return allpolys
	}
	const polys = inflate(countriesRaw)
	const isPointInPoly = (p, points) => {
		let winding = 0
		let countToSouth = 0
		for(let i = 0; i < points.length - 1; i++) {
			const q1 = points[i]
			const q2 = points[i+1]
			const DX = q2[0] - q1[0]
			const DY = q2[1] - q1[1]
			const dx = p[0] - q1[0]
			const dy = p[1] - q1[1]
			const dx2 = p[0] - q2[0]
			if(dx * dx2 < 0) { //cuts ray of point
				const pIsLeft = dy*DX - dx*DY
				const pIsNorth = dx * pIsLeft
				countToSouth += pIsNorth > 0 ? 1 : 0
				winding += pIsNorth * pIsLeft
			}
		}	
		const insideByWinding = winding !== 0 && winding % 2 === 0
		const insideByCountToSouth = countToSouth % 2 === 1
		if(insideByCountToSouth !== insideByCountToSouth) {
			console.warn(p, insideByWinding, insideByCountToSouth)
		}
		return insideByCountToSouth
	}
	const getCountry = (long, lat) => {
		return getCountryIndices(long, lat).map(i=>countryList[i]).join(",")
	}
	const getCountryIndices =  (long, lat) => {
		const containsCoords = (p) => p.north >= lat && p.south <= lat && long >= p.west && long <= p.east
		const couldBe = polys.filter(containsCoords) //  35% of processing time
		//const mayBeCountries = new Set(couldBe.map(p=>p.country))
		const inside = couldBe.filter(poly=>isPointInPoly([long, lat], poly.points)) //  60% of processing time
		const countryIntersections = inside.reduce((o, n)=>{
			let countryIndex = countryList.indexOf(n.country)
			return Object.assign(o, {[countryIndex]: (o[countryIndex]||0)+1})
		}, {})
		const countries = Object.entries(countryIntersections).filter(([c,n])=>n%2===1).map(([c,n])=>c)
		if(countries.length === 0) {
			return [countryList.length - 1] //Ocean
		}
		if(countries.length > 1) {
			//console.warn({long, lat, countries})
		}
		return countries
	}
	const getCountryIndex = (long, lat) => {
		return getCountryIndices(long, lat)[0]
	}
	return {getCountry, polys, countryList, getCountryIndex}
}


//https://towardsdatascience.com/is-the-point-inside-the-polygon-574b86472119
/*
result = (yp - y1) * (x2 -x1) - (xp - x1) * (y2 - y1)
When looking at segment in anticlockwise direction if the result is :

result > 0: Query point lies on left of the line.
result = 0: Query point lies on the line.
result < 0: Query point lies on right of the line.
*/