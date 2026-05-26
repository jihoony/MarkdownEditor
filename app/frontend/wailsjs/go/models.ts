export namespace main {
	
	export class FileInfo {
	    name: string;
	    path: string;
	    isDir: boolean;
	    isMd: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FileInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.isDir = source["isDir"];
	        this.isMd = source["isMd"];
	    }
	}

}

