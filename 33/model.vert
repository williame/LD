precision mediump float;
varying vec2 texel;
varying lowp vec3 lighting;
varying vec3 sn;
attribute vec3 vertex;
attribute vec3 normal;
attribute vec2 texCoord;
uniform mat4 mvMatrix, pMatrix;
uniform mat3 nMatrix;
uniform lowp vec3 lightDir, ambientLight, lightColour;
void main() {
	sn = normal;
	vec3 transformed = normalize(nMatrix*normal);
	float directional = clamp(dot(transformed,lightDir),0.0,1.0);
	lighting = ambientLight + (lightColour*directional);
	texel = texCoord;
	gl_Position = pMatrix * mvMatrix * vec4(vertex,1.0);
}

