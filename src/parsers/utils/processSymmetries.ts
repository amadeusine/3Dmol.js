import { ParserOptionsSpec } from "parsers/ParserOptionsSpec";
import { Matrix3, conversionMatrix3, Vector3 } from "../../WebGL";
import { AtomSpec, Cryst } from "specs";
// Adds symmetry info to either duplicate and rotate/translate biological unit later or add extra atoms now
// matrices may be modified if normalization is requested

export function processSymmetries(
  copyMatrices: string[] | any[],
  atoms: AtomSpec[],
  options: ParserOptionsSpec,
  cryst: Cryst
) {
  const dontDuplicate = !options.duplicateAssemblyAtoms;
  const end = atoms.length;
  let offset = end;

  let modifiedIdentity = -1;
  if (options.normalizeAssembly && cryst) {
    //to normalize, translate every symmetry so that the centroid is
    //in the unit cell.  To do this, convert back to fractional coordinates,
    //compute the centroid, calculate any adjustment needed to get it in [0,1],
    //convert the adjustment to a cartesian translation, and then add it to
    //the symmetry matrix
    const conversionMatrix = conversionMatrix3(
      cryst.a,
      cryst.b,
      cryst.c,
      cryst.alpha,
      cryst.beta,
      cryst.gamma
    );
    const toFrac = new Matrix3();
    toFrac.getInverse3(conversionMatrix);

    for (let t = 0; t < copyMatrices.length; t++) {
      //transform with the symmetry, and then back to fractional coordinates
      const center = new Vector3(0, 0, 0);
      for (let n = 0; n < end; n++) {
        const xyz = new Vector3(atoms[n].x, atoms[n].y, atoms[n].z);
        xyz.applyMatrix4(copyMatrices[t]);
        xyz.applyMatrix3(toFrac);
        //figure out
        center.add(xyz);
      }
      center.divideScalar(end);
      const centerCoord = [center.x, center.y, center.z];
      const adjustment = [0.0, 0.0, 0.0];
      for (let i = 0; i < 3; i++) {
        while (centerCoord[i] < -0.001) {
          centerCoord[i] += 1.0;
          adjustment[i] += 1.0;
        }
        while (centerCoord[i] > 1.001) {
          centerCoord[i] -= 1.0;
          adjustment[i] -= 1.0;
        }
      }
      //convert adjustment to non-fractional
      const adjustmentVec = new Vector3(
        adjustment[0],
        adjustment[1],
        adjustment[2]
      );
      adjustmentVec.applyMatrix3(conversionMatrix);
      //modify symmetry matrix to include translation
      if (
        copyMatrices[t].isNearlyIdentity() &&
        adjustmentVec.lengthSq() > 0.001
      ) {
        modifiedIdentity = t; //keep track of which matrix was identity
      }
      copyMatrices[t].translate(adjustmentVec);
    }
  }
  if (!dontDuplicate) {
    // do full assembly
    for (let n = 0; n < end; n++) {
      atoms[n].sym = -1; //if identity matrix is present, original labeled -1
    }
    for (let t = 0; t < copyMatrices.length; t++) {
      if (!copyMatrices[t].isNearlyIdentity() && modifiedIdentity != t) {
        const xyz = new Vector3();
        for (let n = 0; n < end; n++) {
          const bondsArr: number[] = [];
          for (let l = 0; l < atoms[n].bonds.length; l++) {
            bondsArr.push(atoms[n].bonds[l] + offset);
          }
          xyz.set(atoms[n].x, atoms[n].y, atoms[n].z);
          xyz.applyMatrix4(copyMatrices[t]);

          const newAtom: Record<string, unknown> = {};
          for (const i in atoms[n]) {
            newAtom[i] = atoms[n][i];
          }
          newAtom.x = xyz.x;
          newAtom.y = xyz.y;
          newAtom.z = xyz.z;
          newAtom.bonds = bondsArr;
          newAtom.sym = t; //so symmetries can be selected
          newAtom.index = atoms.length;
          atoms.push(newAtom);
        }
        offset = atoms.length;
      } else {
        for (let n = 0; n < end; n++) {
          atoms[n].sym = t;
        }
      }
    }
    if (modifiedIdentity >= 0) {
      //after applying the other transformations, apply this one in place
      const xyz = new Vector3();
      for (let n = 0; n < end; n++) {
        xyz.set(atoms[n].x, atoms[n].y, atoms[n].z);
        xyz.applyMatrix4(copyMatrices[modifiedIdentity]);
        atoms[n].x = xyz.x;
        atoms[n].y = xyz.y;
        atoms[n].z = xyz.z;
      }
    }
    //we have explicitly duplicated the atoms, remove model symmetry information
    (copyMatrices as any).length = 0;
  } else if (copyMatrices.length > 1) {
    for (let t = 0; t < atoms.length; t++) {
      var symmetries: Vector3[] = [];
      for (let l = 0; l < copyMatrices.length; l++) {
        if (!copyMatrices[l].isNearlyIdentity()) {
          var newXYZ = new Vector3();
          newXYZ.set(atoms[t].x, atoms[t].y, atoms[t].z);
          newXYZ.applyMatrix4(copyMatrices[l]);
          symmetries.push(newXYZ);
        }
      }
      atoms[t].symmetries = symmetries;
    }
  }
}
